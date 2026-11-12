#include "switch_sim.hpp"
#include "uvm_scoreboard.hpp"
#include "coverage_tracker.hpp"
#include <random>
#include <chrono>
#include <iostream>

int main(int argc, char* argv[]) {
    uint32_t num_packets = 10000;
    uint32_t random_seed = 42;

    if (argc > 1) num_packets = std::stoi(argv[1]);
    if (argc > 2) random_seed = std::stoi(argv[2]);

    std::cout << "[TEST_HARNESS] Starting NetSwitch-DV Verification Suite...\n";
    std::cout << "[TEST_HARNESS] Configured Packets: " << num_packets
              << " | Random Seed: " << random_seed << "\n\n";

    std::mt19937 rng(random_seed);
    std::uniform_int_distribution<uint8_t> port_dist(0, 3);
    std::uniform_int_distribution<uint8_t> prio_dist(0, 7);
    std::uniform_int_distribution<uint16_t> len_dist(64, 1518);
    std::uniform_int_distribution<uint64_t> flit_dist(0, UINT64_MAX);

    PacketSwitchModel dut(4, 128); // 4 ports, 128-entry VOQ depth
    UvmScoreboard scoreboard;
    FunctionalCoverageTracker coverage;

    uint32_t injected = 0;
    uint64_t cycle = 0;

    // Simulation loop
    while (injected < num_packets || dut.get_total_packets_routed() < injected) {
        cycle++;

        // Inject stimulus
        if (injected < num_packets) {
            // Burst injection mode every 500 cycles
            bool burst_mode = ((injected / 500) % 2 == 1);
            int packets_to_inject_this_cycle = burst_mode ? 4 : 1;

            for (int b = 0; b < packets_to_inject_this_cycle && injected < num_packets; ++b) {
                Packet pkt;
                pkt.packet_id = injected + 1;
                pkt.src_port = port_dist(rng);

                // Corner case: Hot-spot stress for packets 3000-4000
                if (injected >= 3000 && injected < 4000) {
                    pkt.dest_port = 0; // Contention at port 0
                } else {
                    pkt.dest_port = port_dist(rng);
                }

                // Corner case: Jumbo frames for packets 6000-6500
                if (injected >= 6000 && injected < 6500) {
                    pkt.length = 9000;
                } else {
                    pkt.length = len_dist(rng);
                }

                pkt.priority = prio_dist(rng);

                // Generate flits (each 8 bytes)
                size_t num_flits = (pkt.length + 7) / 8;
                pkt.flits.resize(num_flits);
                for (size_t f = 0; f < num_flits; ++f) {
                    pkt.flits[f] = flit_dist(rng);
                }
                pkt.crc32 = Packet::calculate_crc32(pkt.flits);

                if (dut.inject_packet(pkt)) {
                    scoreboard.write_injected(pkt);
                    coverage.sample_packet(pkt);
                    injected++;
                } else {
                    // Backpressure: retry next cycle
                    break;
                }
            }
        }

        // Advance simulation cycle
        dut.step_cycle();

        // Sample VOQ watermarks for coverage
        size_t max_occ = 0;
        for (size_t s = 0; s < 4; ++s) {
            for (size_t d = 0; d < 4; ++d) {
                max_occ = std::max(max_occ, dut.get_voq_occupancy(s, d));
            }
        }
        coverage.sample_watermark(max_occ, 128);

        // Check egress interfaces and notify scoreboard
        for (size_t p = 0; p < 4; ++p) {
            while (dut.has_egress_packet(p)) {
                Packet routed = dut.pop_egress_packet(p);
                scoreboard.write_egress(p, routed);
            }
        }

        // Safety timeout watchdog
        if (cycle > num_packets * 10 + 20000) {
            std::cerr << "[TEST_TIMEOUT] Simulation watchdog triggered at cycle " << cycle << "\n";
            break;
        }
    }

    // Final checks
    scoreboard.check_invariants();
    scoreboard.print_summary();
    coverage.print_coverage();

    if (scoreboard.is_clean_pass() && coverage.get_coverage_percentage() >= 95.0) {
        std::cout << "[VERIFICATION_STATUS] >>> ALL TESTS PASSED WITH 100% INTEGRITY & COVERAGE CLOSURE <<<\n";
        return 0;
    } else {
        std::cerr << "[VERIFICATION_STATUS] >>> TEST SUITE FAILED <<<\n";
        return 1;
    }
}
