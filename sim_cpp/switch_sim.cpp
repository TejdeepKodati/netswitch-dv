#include "switch_sim.hpp"
#include <algorithm>

uint32_t Packet::calculate_crc32(const std::vector<uint64_t>& data_flits) {
    uint32_t crc = 0xFFFFFFFF;
    for (uint64_t flit : data_flits) {
        for (int byte = 0; byte < 8; ++byte) {
            uint8_t b = (flit >> (byte * 8)) & 0xFF;
            crc ^= b;
            for (int bit = 0; bit < 8; ++bit) {
                if (crc & 1)
                    crc = (crc >> 1) ^ 0xEDB88320;
                else
                    crc = (crc >> 1);
            }
        }
    }
    return ~crc;
}

// --- AsyncFifoModel ---
AsyncFifoModel::AsyncFifoModel(size_t depth) : depth_(depth) {}

bool AsyncFifoModel::push(uint64_t flit) {
    if (is_full()) return false;
    mem_.push_back(flit);
    wr_ptr_bin_++;
    wr_ptr_gray_ = wr_ptr_bin_ ^ (wr_ptr_bin_ >> 1);
    return true;
}

bool AsyncFifoModel::pop(uint64_t& flit) {
    if (is_empty()) return false;
    flit = mem_.front();
    mem_.pop_front();
    rd_ptr_bin_++;
    rd_ptr_gray_ = rd_ptr_bin_ ^ (rd_ptr_bin_ >> 1);
    return true;
}

bool AsyncFifoModel::is_full() const {
    return mem_.size() >= depth_;
}

bool AsyncFifoModel::is_empty() const {
    return mem_.empty();
}

size_t AsyncFifoModel::get_occupancy() const {
    return mem_.size();
}

size_t AsyncFifoModel::get_credit_count() const {
    return (depth_ >= mem_.size()) ? (depth_ - mem_.size()) : 0;
}

void AsyncFifoModel::step_write_clock() {
    // 2-stage synchronizer for read pointer into write clock domain
    rd_ptr_gray_sync_ = rd_ptr_gray_meta_;
    rd_ptr_gray_meta_ = rd_ptr_gray_;
}

void AsyncFifoModel::step_read_clock() {
    // 2-stage synchronizer for write pointer into read clock domain
    wr_ptr_gray_sync_ = wr_ptr_gray_meta_;
    wr_ptr_gray_meta_ = wr_ptr_gray_;
}

// --- DrrArbiterModel ---
DrrArbiterModel::DrrArbiterModel(size_t num_inputs, uint32_t default_quantum)
    : num_inputs_(num_inputs), default_quantum_(default_quantum), current_pointer_(0), deficit_(num_inputs, 0) {}

int DrrArbiterModel::arbitrate(const std::vector<bool>& requests, const std::vector<uint16_t>& packet_sizes) {
    bool has_any_request = false;
    for (bool req : requests) {
        if (req) { has_any_request = true; break; }
    }
    if (!has_any_request) return -1;

    for (size_t iter = 0; iter < num_inputs_; ++iter) {
        size_t candidate = (current_pointer_ + iter) % num_inputs_;
        if (requests[candidate]) {
            if (deficit_[candidate] == 0) {
                deficit_[candidate] += default_quantum_;
            }
            if (deficit_[candidate] >= packet_sizes[candidate]) {
                deficit_[candidate] -= packet_sizes[candidate];
                current_pointer_ = (candidate + 1) % num_inputs_;
                return static_cast<int>(candidate);
            }
        } else {
            deficit_[candidate] = 0;
        }
    }
    // If quantum was exhausted, replenish current pointer and award
    deficit_[current_pointer_] += default_quantum_;
    int granted = static_cast<int>(current_pointer_);
    deficit_[current_pointer_] = std::max(0, deficit_[current_pointer_] - static_cast<int32_t>(packet_sizes[current_pointer_]));
    current_pointer_ = (current_pointer_ + 1) % num_inputs_;
    return granted;
}

// --- PacketSwitchModel ---
PacketSwitchModel::PacketSwitchModel(size_t num_ports, size_t voq_depth)
    : num_ports_(num_ports), voq_depth_(voq_depth),
      voqs_(num_ports, std::vector<std::deque<Packet>>(num_ports)),
      egress_queues_(num_ports) {
    for (size_t i = 0; i < num_ports_; ++i) {
        ingress_fifos_.push_back(std::make_unique<AsyncFifoModel>(voq_depth));
        egress_arbiters_.emplace_back(num_ports_, 1500);
    }
}

bool PacketSwitchModel::inject_packet(const Packet& pkt) {
    if (pkt.src_port >= num_ports_ || pkt.dest_port >= num_ports_) {
        total_packets_dropped_++;
        return false;
    }

    if (voqs_[pkt.src_port][pkt.dest_port].size() >= voq_depth_) {
        // Backpressure queue full
        total_packets_dropped_++;
        return false;
    }

    Packet enqueued_pkt = pkt;
    enqueued_pkt.inject_cycle = current_cycle_;
    voqs_[pkt.src_port][pkt.dest_port].push_back(enqueued_pkt);
    return true;
}

void PacketSwitchModel::step_cycle() {
    current_cycle_++;

    // Step clock domains for asynchronous FIFOs
    for (auto& fifo : ingress_fifos_) {
        fifo->step_write_clock();
        fifo->step_read_clock();
    }

    // Arbitrate each egress port across all ingress VOQs targeting it
    for (size_t out_port = 0; out_port < num_ports_; ++out_port) {
        std::vector<bool> reqs(num_ports_, false);
        std::vector<uint16_t> sizes(num_ports_, 64);

        for (size_t in_port = 0; in_port < num_ports_; ++in_port) {
            if (!voqs_[in_port][out_port].empty()) {
                reqs[in_port] = true;
                sizes[in_port] = voqs_[in_port][out_port].front().length;
            }
        }

        int grant = egress_arbiters_[out_port].arbitrate(reqs, sizes);
        if (grant >= 0 && grant < static_cast<int>(num_ports_)) {
            if (!voqs_[grant][out_port].empty()) {
                Packet routed = voqs_[grant][out_port].front();
                voqs_[grant][out_port].pop_front();
                routed.egress_cycle = current_cycle_;
                egress_queues_[out_port].push_back(routed);
                total_packets_routed_++;
            }
        }
    }
}

bool PacketSwitchModel::has_egress_packet(size_t port) const {
    if (port >= num_ports_) return false;
    return !egress_queues_[port].empty();
}

Packet PacketSwitchModel::pop_egress_packet(size_t port) {
    Packet p = egress_queues_[port].front();
    egress_queues_[port].pop_front();
    return p;
}

size_t PacketSwitchModel::get_voq_occupancy(size_t src_port, size_t dest_port) const {
    if (src_port < num_ports_ && dest_port < num_ports_) {
        return voqs_[src_port][dest_port].size();
    }
    return 0;
}
