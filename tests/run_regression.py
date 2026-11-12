#!/usr/bin/env python3
"""
NetSwitch-DV: Automated Regression Suite & Coverage Signoff Runner
Executes multi-seed constrained-random tests, parses UVM scoreboard output,
tracks functional coverage closure, and outputs JSON/JUnit test artifacts.
"""

import subprocess
import os
import sys
import re
import json

SEEDS = [42, 101, 202, 303, 404, 505, 777, 999]
PACKETS_PER_RUN = 5000

def compile_sim(sim_dir):
    print("[REGRESSION] Compiling C++ cycle-accurate simulation harness...")
    cmd = ["g++", "-O2", "-std=c++17", "test_main.cpp", "switch_sim.cpp", "uvm_scoreboard.cpp", "-o", "sim_runner.exe"]
    res = subprocess.run(cmd, cwd=sim_dir, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[REGRESSION_ERROR] Compilation failed:\n{res.stderr}")
        sys.exit(1)
    print("[REGRESSION] Compilation successful.")

def run_seed(sim_dir, packets, seed):
    exe = os.path.join(sim_dir, "sim_runner.exe")
    cmd = [exe, str(packets), str(seed)]
    res = subprocess.run(cmd, cwd=sim_dir, capture_output=True, text=True)
    
    # Parse output metrics
    out = res.stdout
    matched_m = re.search(r"Total Packets Matched\s*:\s*(\d+)", out)
    mismatches_m = re.search(r"Total Data Mismatches\s*:\s*(\d+)", out)
    crc_m = re.search(r"Total CRC Integrity Errors\s*:\s*(\d+)", out)
    dropped_m = re.search(r"Total Dropped / Leaked\s*:\s*(\d+)", out)
    cov_m = re.search(r"Coverage Closure\s*:\s*([\d\.]+)%", out)
    latency_m = re.search(r"Average Latency \(cycles\)\s*:\s*([\d\.]+)", out)

    matched = int(matched_m.group(1)) if matched_m else 0
    mismatches = int(mismatches_m.group(1)) if mismatches_m else 0
    crc_errs = int(crc_m.group(1)) if crc_m else 0
    dropped = int(dropped_m.group(1)) if dropped_m else 0
    coverage = float(cov_m.group(1)) if cov_m else 0.0
    avg_latency = float(latency_m.group(1)) if latency_m else 0.0

    passed = (res.returncode == 0) and (mismatches == 0) and (crc_errs == 0) and (dropped == 0) and (coverage >= 95.0)

    return {
        "seed": seed,
        "packets": packets,
        "matched": matched,
        "mismatches": mismatches,
        "crc_errors": crc_errs,
        "dropped": dropped,
        "coverage": coverage,
        "avg_latency": avg_latency,
        "passed": passed
    }

def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sim_dir = os.path.join(base_dir, "sim_cpp")
    results_file = os.path.join(base_dir, "tests", "regression_results.json")

    compile_sim(sim_dir)

    all_results = []
    total_passed = 0

    print(f"\n[REGRESSION] Starting multi-seed verification suite ({len(SEEDS)} runs)...")
    print(f"{'Seed':<8} {'Packets':<10} {'Matched':<10} {'Drops':<8} {'CRC Err':<10} {'Coverage':<10} {'Latency':<10} {'Result'}")
    print("-" * 80)

    for seed in SEEDS:
        r = run_seed(sim_dir, PACKETS_PER_RUN, seed)
        all_results.append(r)
        status_str = "PASS" if r["passed"] else "FAIL"
        if r["passed"]: total_passed += 1
        print(f"{r['seed']:<8} {r['packets']:<10} {r['matched']:<10} {r['dropped']:<8} {r['crc_errors']:<10} {r['coverage']:<9.1f}% {r['avg_latency']:<10.2f} {status_str}")

    summary = {
        "total_runs": len(SEEDS),
        "total_passed": total_passed,
        "total_failed": len(SEEDS) - total_passed,
        "total_packets_verified": sum(r["matched"] for r in all_results),
        "mean_coverage": sum(r["coverage"] for r in all_results) / len(all_results),
        "results": all_results
    }

    with open(results_file, "w") as f:
        json.dump(summary, f, indent=2)

    print("-" * 80)
    print(f"[REGRESSION] Summary: {total_passed}/{len(SEEDS)} Passed | Packets: {summary['total_packets_verified']} | Coverage: {summary['mean_coverage']:.2f}%")
    print(f"[REGRESSION] Results saved to: {results_file}\n")

    if total_passed != len(SEEDS):
        sys.exit(1)

if __name__ == "__main__":
    main()
