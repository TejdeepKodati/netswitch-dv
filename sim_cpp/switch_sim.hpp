#ifndef SWITCH_SIM_HPP
#define SWITCH_SIM_HPP

#include <cstdint>
#include <vector>
#include <deque>
#include <string>
#include <memory>
#include <iostream>

struct Packet {
    uint32_t packet_id;
    uint16_t length;          // in bytes (64 to 9000)
    uint8_t  src_port;        // 0 to 3
    uint8_t  dest_port;       // 0 to 3
    uint8_t  priority;        // 0 to 7
    uint32_t crc32;
    uint64_t inject_cycle;
    uint64_t egress_cycle;
    std::vector<uint64_t> flits; // 64-bit flits

    static uint32_t calculate_crc32(const std::vector<uint64_t>& data_flits);
};

// Asynchronous Elastic CDC FIFO Model with Gray pointer mechanics
class AsyncFifoModel {
public:
    AsyncFifoModel(size_t depth = 32);
    bool push(uint64_t flit);
    bool pop(uint64_t& flit);
    bool is_full() const;
    bool is_empty() const;
    size_t get_occupancy() const;
    size_t get_credit_count() const;
    void step_write_clock();
    void step_read_clock();

private:
    size_t depth_;
    std::deque<uint64_t> mem_;
    uint32_t wr_ptr_bin_{0};
    uint32_t rd_ptr_bin_{0};
    uint32_t wr_ptr_gray_{0};
    uint32_t rd_ptr_gray_{0};
    // 2-flop synchronizer state
    uint32_t rd_ptr_gray_meta_{0}, rd_ptr_gray_sync_{0};
    uint32_t wr_ptr_gray_meta_{0}, wr_ptr_gray_sync_{0};
};

// Deficit Round Robin Arbiter model
class DrrArbiterModel {
public:
    DrrArbiterModel(size_t num_inputs = 4, uint32_t default_quantum = 1500);
    int arbitrate(const std::vector<bool>& requests, const std::vector<uint16_t>& packet_sizes);

private:
    size_t num_inputs_;
    uint32_t default_quantum_;
    size_t current_pointer_{0};
    std::vector<int32_t> deficit_;
};

// 4x4 Non-blocking Packet Switch Subsystem
class PacketSwitchModel {
public:
    PacketSwitchModel(size_t num_ports = 4, size_t voq_depth = 64);

    bool inject_packet(const Packet& pkt);
    void step_cycle();
    bool has_egress_packet(size_t port) const;
    Packet pop_egress_packet(size_t port);

    size_t get_voq_occupancy(size_t src_port, size_t dest_port) const;
    uint64_t get_current_cycle() const { return current_cycle_; }
    uint64_t get_total_packets_routed() const { return total_packets_routed_; }
    uint64_t get_total_packets_dropped() const { return total_packets_dropped_; }

private:
    size_t num_ports_;
    size_t voq_depth_;
    uint64_t current_cycle_{0};
    uint64_t total_packets_routed_{0};
    uint64_t total_packets_dropped_{0};

    // 16 Virtual Output Queues (4 inputs x 4 outputs)
    std::vector<std::vector<std::deque<Packet>>> voqs_;
    // CDC Asynchronous rate-adaptation FIFOs on ingress
    std::vector<std::unique_ptr<AsyncFifoModel>> ingress_fifos_;
    // DRR Arbiters per egress port
    std::vector<DrrArbiterModel> egress_arbiters_;
    // Egress output buffers
    std::vector<std::deque<Packet>> egress_queues_;
};

#endif // SWITCH_SIM_HPP
