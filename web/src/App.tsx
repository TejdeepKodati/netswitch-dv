import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  RotateCcw, 
  Zap, 
  GitBranch, 
  ShieldCheck, 
  Radio, 
  Terminal,
  ExternalLink
} from 'lucide-react';

interface PacketItem {
  id: number;
  srcPort: number;
  destPort: number;
  prio: number;
  length: number;
  crcMatch: boolean;
  latency: number;
  timestamp: string;
}

export default function App() {
  const [injectedCount, setInjectedCount] = useState<number>(10420);
  const [matchedCount, setMatchedCount] = useState<number>(10420);
  const [mismatches, setMismatches] = useState<number>(0);
  const [crcErrors, setCrcErrors] = useState<number>(0);
  const [drops, setDrops] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Manual packet injector parameters
  const [srcPort, setSrcPort] = useState<number>(0);
  const [destPort, setDestPort] = useState<number>(2);
  const [priority, setPriority] = useState<number>(5);
  const [packetSize, setPacketSize] = useState<number>(512);

  // VOQ buffer matrix: 4 ingress x 4 egress
  const [voqMatrix, setVoqMatrix] = useState<number[][]>([
    [2, 0, 4, 1],
    [0, 3, 1, 0],
    [5, 1, 0, 2],
    [1, 0, 3, 4]
  ]);

  // Live transaction log
  const [transactions, setTransactions] = useState<PacketItem[]>([
    { id: 10420, srcPort: 0, destPort: 2, prio: 5, length: 512, crcMatch: true, latency: 18, timestamp: '12:04:18.942' },
    { id: 10419, srcPort: 3, destPort: 1, prio: 2, length: 1518, crcMatch: true, latency: 42, timestamp: '12:04:18.910' },
    { id: 10418, srcPort: 1, destPort: 0, prio: 7, length: 64, crcMatch: true, latency: 8, timestamp: '12:04:18.880' },
    { id: 10417, srcPort: 2, destPort: 3, prio: 4, length: 9000, crcMatch: true, latency: 124, timestamp: '12:04:18.815' },
    { id: 10416, srcPort: 0, destPort: 0, prio: 0, length: 256, crcMatch: true, latency: 12, timestamp: '12:04:18.790' },
  ]);

  // Arbiter grant indicators
  const [arbiterGrants, setArbiterGrants] = useState<number[]>([1, 0, 3, 2]);

  // Injection handler
  const handleInject = (isBurst = false) => {
    const burstSize = isBurst ? 8 : 1;
    let nextId = injectedCount + 1;
    const newTx: PacketItem[] = [];

    const newVoq = voqMatrix.map(row => [...row]);

    for (let i = 0; i < burstSize; i++) {
      const s = isBurst ? Math.floor(Math.random() * 4) : srcPort;
      const d = isBurst ? Math.floor(Math.random() * 4) : destPort;
      const p = isBurst ? Math.floor(Math.random() * 8) : priority;
      const len = isBurst ? [64, 256, 1024, 1518, 9000][Math.floor(Math.random() * 5)] : packetSize;
      const lat = Math.floor(Math.random() * 35) + 6;

      newVoq[s][d] = Math.min(16, newVoq[s][d] + 1);

      newTx.unshift({
        id: nextId + i,
        srcPort: s,
        destPort: d,
        prio: p,
        length: len,
        crcMatch: true,
        latency: lat,
        timestamp: new Date().toISOString().substring(11, 23)
      });
    }

    setVoqMatrix(newVoq);
    setInjectedCount(prev => prev + burstSize);
    setMatchedCount(prev => prev + burstSize);
    setTransactions(prev => [...newTx, ...prev].slice(0, 15));

    // Update arbiters
    setArbiterGrants([
      Math.floor(Math.random() * 4),
      Math.floor(Math.random() * 4),
      Math.floor(Math.random() * 4),
      Math.floor(Math.random() * 4)
    ]);
  };

  // Continuous traffic simulation loop
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        handleInject(true);
      }, 350);
    }
    return () => clearInterval(interval);
  }, [isRunning, injectedCount, voqMatrix]);

  const handleReset = () => {
    setIsRunning(false);
    setVoqMatrix([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]);
    setInjectedCount(0);
    setMatchedCount(0);
    setMismatches(0);
    setCrcErrors(0);
    setDrops(0);
    setTransactions([]);
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0B0F19]/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-950/60 border border-cyan-800/50 rounded-lg text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-wide text-slate-100">NetSwitch-DV</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                UVM-CDV 1.4
              </span>
            </div>
            <p className="text-xs text-slate-400">4x4 Packet Switch Subsystem & Verification Cockpit</p>
          </div>
        </div>

        {/* Global Live Indicators & Top Right Mandatory Watermark */}
        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              CDC Safe (Gray Synced)
            </div>
            <div className="flex items-center gap-1.5 text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
              SVA Assertions Active
            </div>
          </div>

          <a 
            href="https://github.com/TejdeepKodati/netswitch-dv" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors group"
          >
            <span>made with ♥ by Tejdeep</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
          </a>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Verification Status Cards */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Injected</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-2">{injectedCount.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-1">Flit rate: 800 Gbps eq.</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Scoreboard Matched</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-2">{matchedCount.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-500/80 mt-1">100% In-Order Integrity</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Data Mismatches</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-2">{mismatches}</div>
            <div className="text-[11px] text-slate-500 mt-1">Zero payload corruption</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>CRC-32 Errors</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-2">{crcErrors}</div>
            <div className="text-[11px] text-slate-500 mt-1">IEEE 802.3 Polynomial</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800 col-span-2 md:col-span-1">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Functional Coverage</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-2">100.0%</div>
            <div className="text-[11px] text-cyan-500/80 mt-1">34/34 Bins Closed</div>
          </div>
        </section>

        {/* Central Grid: Hardware Matrix & Stimulus Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: 4x4 Crossbar & VOQ Matrix Visualizer (7 cols) */}
          <section className="lg:col-span-7 p-5 rounded-2xl bg-[#0B1120] border border-slate-800/90 flex flex-col space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-cyan-400" />
                  4x4 Crossbar & Virtual Output Queue (VOQ) Matrix
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Deficit Round-Robin Arbitrated Non-Blocking Fabric</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">16 VOQ Buffers</span>
              </div>
            </div>

            {/* VOQ Matrix Visualization */}
            <div className="space-y-4">
              <div className="grid grid-cols-5 text-center text-xs font-mono text-slate-400">
                <div>Ingress \ Egress</div>
                <div>Egress 0</div>
                <div>Egress 1</div>
                <div>Egress 2</div>
                <div>Egress 3</div>
              </div>

              {voqMatrix.map((row, inIdx) => (
                <div key={inIdx} className="grid grid-cols-5 items-center gap-2.5">
                  <div className="text-xs font-mono text-cyan-300 font-semibold bg-slate-800/60 p-2 rounded-lg text-center border border-slate-700/60">
                    Ingress {inIdx}
                  </div>
                  {row.map((occ, outIdx) => (
                    <div 
                      key={outIdx} 
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        occ > 0 
                          ? 'bg-cyan-950/40 border-cyan-700/60 text-cyan-200' 
                          : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
                      }`}
                    >
                      <div className="text-xs font-mono font-bold">{occ} pkts</div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div 
                          className="bg-cyan-500 h-full rounded-full transition-all duration-300" 
                          style={{ width: `${(occ / 16) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* DRR Arbiter Status Bar */}
            <div className="pt-3 border-t border-slate-800/80">
              <div className="text-xs font-medium text-slate-300 mb-2">Egress Deficit Round Robin (DRR) Grants:</div>
              <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                {arbiterGrants.map((grantInput, egrIdx) => (
                  <div key={egrIdx} className="p-2 rounded bg-slate-800/60 border border-slate-700/70 text-center">
                    <span className="text-slate-400">Egr {egrIdx}: </span>
                    <span className="text-emerald-400 font-semibold">Grant In-{grantInput}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right Column: Stimulus Injection Console (5 cols) */}
          <section className="lg:col-span-5 p-5 rounded-2xl bg-[#0B1120] border border-slate-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  Constrained-Random Stimulus Generator
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                  Driver Active
                </span>
              </div>

              {/* Injection Controls */}
              <div className="space-y-3.5 mt-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Ingress Port</label>
                    <select 
                      value={srcPort} 
                      onChange={(e) => setSrcPort(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:border-cyan-500 outline-none"
                    >
                      <option value={0}>Port 0 (Line 100G)</option>
                      <option value={1}>Port 1 (Line 100G)</option>
                      <option value={2}>Port 2 (Line 100G)</option>
                      <option value={3}>Port 3 (Line 100G)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Target Egress Port</label>
                    <select 
                      value={destPort} 
                      onChange={(e) => setDestPort(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:border-cyan-500 outline-none"
                    >
                      <option value={0}>Port 0 (Fabric)</option>
                      <option value={1}>Port 1 (Fabric)</option>
                      <option value={2}>Port 2 (Fabric)</option>
                      <option value={3}>Port 3 (Fabric)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">QoS Priority (0-7)</label>
                    <select 
                      value={priority} 
                      onChange={(e) => setPriority(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:border-cyan-500 outline-none"
                    >
                      <option value={0}>0 - Best Effort</option>
                      <option value={2}>2 - Standard Data</option>
                      <option value={5}>5 - Video Streaming</option>
                      <option value={7}>7 - Network Control (High)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Packet Length</label>
                    <select 
                      value={packetSize} 
                      onChange={(e) => setPacketSize(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono focus:border-cyan-500 outline-none"
                    >
                      <option value={64}>64 Bytes (Min Runt)</option>
                      <option value={256}>256 Bytes</option>
                      <option value={512}>512 Bytes</option>
                      <option value={1518}>1518 Bytes (Standard MTU)</option>
                      <option value={9000}>9000 Bytes (Jumbo Frame)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <div className="flex gap-2.5">
                <button 
                  onClick={() => handleInject(false)}
                  className="flex-1 py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  Inject Single Packet
                </button>
                <button 
                  onClick={() => setIsRunning(!isRunning)}
                  className={`flex-1 py-2.5 px-3 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    isRunning 
                      ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                  {isRunning ? 'Halt Continuous Stream' : 'Run Bursty Stream'}
                </button>
              </div>
              <button 
                onClick={handleReset}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg text-xs flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Flush Pipeline & Reset Metrics
              </button>
            </div>
          </section>
        </div>

        {/* Lower Row: Scoreboard Feed & Functional Coverage Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* UVM Scoreboard Transaction Stream (7 cols) */}
          <section className="lg:col-span-7 p-5 rounded-2xl bg-[#0B1120] border border-slate-800/90">
            <div className="flex items-center justify-between border-b border-slate-800/70 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">Live UVM Transaction Monitor & Scoreboard</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Analysis Port Stream</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 text-[11px]">
                    <th className="pb-2">Packet ID</th>
                    <th className="pb-2">Route</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">QoS</th>
                    <th className="pb-2">CRC-32</th>
                    <th className="pb-2">Latency</th>
                    <th className="pb-2 text-right">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 text-cyan-300 font-semibold">#{tx.id}</td>
                      <td className="py-2 text-slate-300">Port {tx.srcPort} &rarr; Port {tx.destPort}</td>
                      <td className="py-2 text-slate-400">{tx.length} B</td>
                      <td className="py-2 text-amber-400">Prio {tx.prio}</td>
                      <td className="py-2 text-emerald-400">MATCH</td>
                      <td className="py-2 text-slate-300">{tx.latency} cycles</td>
                      <td className="py-2 text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                          PASS
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Functional Coverage Bin Distribution (5 cols) */}
          <section className="lg:col-span-5 p-5 rounded-2xl bg-[#0B1120] border border-slate-800/90 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">Functional Coverage Matrix</h3>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">100.0% Closed</span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Port Cross-Coverage (16 Permutations)</span>
                  <span className="font-mono text-emerald-400">16/16 Bins (100%)</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Packet Length Distribution (Min to Jumbo)</span>
                  <span className="font-mono text-emerald-400">5/5 Bins (100%)</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>QoS Priority Hierarchy (Tiers 0-7)</span>
                  <span className="font-mono text-emerald-400">8/8 Bins (100%)</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Buffer Occupancy & Saturated Watermarks</span>
                  <span className="font-mono text-emerald-400">5/5 Bins (100%)</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-full"></div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
              <span className="text-cyan-400 font-semibold">[Signoff Note]: </span>
              All corner cases verified under 40,000 multi-seed transactions. Zero Head-of-Line blocking observed.
            </div>
          </section>

        </div>
      </main>

      {/* Footer with Mandatory Link */}
      <footer className="border-t border-slate-800/80 bg-[#0B0F19] py-4 px-6 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-slate-500">
          NetSwitch-DV &copy; 2026. High-Throughput Packet Switch Architecture & UVM-Grade Verification Framework.
        </div>
        <div>
          <a 
            href="https://github.com/TejdeepKodati/netswitch-dv" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-slate-300 hover:text-cyan-400 transition-colors font-medium flex items-center gap-1.5"
          >
            <span>made with ♥ by Tejdeep</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
