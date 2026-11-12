#include "uvm_scoreboard.hpp"
#include <iomanip>

UvmScoreboard::UvmScoreboard() {}

void UvmScoreboard::write_injected(const Packet& pkt) {
    metrics_.total_injected++;
    pending_packets_[pkt.packet_id] = pkt;
}

void UvmScoreboard::write_egress(size_t port, const Packet& actual_pkt) {
    auto it = pending_packets_.find(actual_pkt.packet_id);
    if (it == pending_packets_.end()) {
        metrics_.total_mismatches++;
        std::cerr << "[UVM_ERROR] Unexpected packet ID " << actual_pkt.packet_id
                  << " observed at egress port " << port << std::endl;
        return;
    }

    const Packet& expected = it->second;

    // Verify Destination Port correctness
    if (expected.dest_port != port || actual_pkt.dest_port != port) {
        metrics_.total_mismatches++;
        std::cerr << "[UVM_MISMATCH] Routing error for pkt " << expected.packet_id
                  << ": expected port " << (int)expected.dest_port
                  << ", observed on port " << port << std::endl;
    }

    // Verify CRC-32 integrity
    uint32_t expected_crc = Packet::calculate_crc32(actual_pkt.flits);
    if (actual_pkt.crc32 != expected.crc32 || actual_pkt.crc32 != expected_crc) {
        metrics_.crc_errors++;
        metrics_.total_mismatches++;
        std::cerr << "[UVM_CRC_ERROR] CRC mismatch on pkt " << expected.packet_id << std::endl;
    }

    // Track latency
    uint64_t latency = (actual_pkt.egress_cycle >= expected.inject_cycle)
                           ? (actual_pkt.egress_cycle - expected.inject_cycle)
                           : 1;
    if (latency < metrics_.min_latency) metrics_.min_latency = latency;
    if (latency > metrics_.max_latency) metrics_.max_latency = latency;
    accumulated_latency_ += latency;

    // Out-of-order check within the same source-dest flow
    if (last_seq_per_port_.find(port) != last_seq_per_port_.end()) {
        if (actual_pkt.packet_id < last_seq_per_port_[port]) {
            metrics_.out_of_order_count++;
        }
    }
    last_seq_per_port_[port] = actual_pkt.packet_id;

    metrics_.total_matched++;
    pending_packets_.erase(it);
}

bool UvmScoreboard::check_invariants() {
    // Audit any leaked or trapped packets
    metrics_.total_dropped = pending_packets_.size();
    if (metrics_.total_matched > 0) {
        metrics_.avg_latency = static_cast<double>(accumulated_latency_) / metrics_.total_matched;
    } else {
        metrics_.avg_latency = 0.0;
        metrics_.min_latency = 0;
    }
    return (metrics_.total_mismatches == 0) && (metrics_.crc_errors == 0) && (metrics_.total_dropped == 0);
}

bool UvmScoreboard::is_clean_pass() const {
    return (metrics_.total_mismatches == 0) &&
           (metrics_.crc_errors == 0) &&
           (metrics_.total_dropped == 0) &&
           (metrics_.total_matched > 0);
}

void UvmScoreboard::print_summary() const {
    std::cout << "\n=================================================================\n";
    std::cout << "                 UVM VERIFICATION SCOREBOARD REPORT             \n";
    std::cout << "=================================================================\n";
    std::cout << " Total Packets Injected     : " << metrics_.total_injected << "\n";
    std::cout << " Total Packets Matched      : " << metrics_.total_matched << "\n";
    std::cout << " Total Data Mismatches      : " << metrics_.total_mismatches << "\n";
    std::cout << " Total CRC Integrity Errors : " << metrics_.crc_errors << "\n";
    std::cout << " Total Dropped / Leaked     : " << metrics_.total_dropped << "\n";
    std::cout << " Min / Max Latency (cycles) : " << metrics_.min_latency << " / " << metrics_.max_latency << "\n";
    std::cout << std::fixed << std::setprecision(2);
    std::cout << " Average Latency (cycles)   : " << metrics_.avg_latency << "\n";
    std::cout << " Status                     : " << (is_clean_pass() ? "[PASSED - 100% INTEGRITY]" : "[FAILED]") << "\n";
    std::cout << "=================================================================\n\n";
}
