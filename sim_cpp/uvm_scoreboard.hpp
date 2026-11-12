#ifndef UVM_SCOREBOARD_HPP
#define UVM_SCOREBOARD_HPP

#include "switch_sim.hpp"
#include <unordered_map>
#include <vector>
#include <string>
#include <iostream>

struct ScoreboardMetrics {
    uint64_t total_injected{0};
    uint64_t total_matched{0};
    uint64_t total_mismatches{0};
    uint64_t total_dropped{0};
    uint64_t min_latency{UINT64_MAX};
    uint64_t max_latency{0};
    double   avg_latency{0.0};
    uint64_t crc_errors{0};
    uint64_t out_of_order_count{0};
};

class UvmScoreboard {
public:
    UvmScoreboard();

    // Analysis export for injected packets from stimulus generator
    void write_injected(const Packet& pkt);

    // Analysis export for observed packets from switch egress monitors
    void write_egress(size_t port, const Packet& pkt);

    // Protocol assertion checks
    bool check_invariants();

    // Final report and signoff status
    void print_summary() const;
    const ScoreboardMetrics& get_metrics() const { return metrics_; }
    bool is_clean_pass() const;

private:
    std::unordered_map<uint32_t, Packet> pending_packets_;
    std::unordered_map<size_t, uint32_t> last_seq_per_port_;
    ScoreboardMetrics metrics_;
    uint64_t accumulated_latency_{0};
};

#endif // UVM_SCOREBOARD_HPP
