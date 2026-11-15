import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DEFAULT_PROCESSES = [
  { id: "P1", arrival: 0, burst: 8 },
  { id: "P2", arrival: 1, burst: 6 },
  { id: "P3", arrival: 2, burst: 2 },
  { id: "P4", arrival: 3, burst: 4 },
  { id: "P5", arrival: 5, burst: 1 },
];

const PROCESS_COLORS = ["#57e3b4", "#ffb454", "#7aa7ff", "#f47c8c", "#b995ff", "#52d4e7", "#d2e85c"];

const ALGORITHMS = {
  sjf: {
    short: "SJF",
    name: "Shortest Job First",
    type: "Non-preemptive",
    rule: "Runs the available process with the smallest burst time.",
  },
  srtf: {
    short: "SRTF",
    name: "Shortest Remaining Time First",
    type: "Preemptive",
    rule: "Always runs the process with the least remaining work.",
  },
  hrrn: {
    short: "HRRN",
    name: "Highest Response Ratio Next",
    type: "Non-preemptive",
    rule: "Chooses the highest (waiting + burst) / burst ratio.",
  },
  aware: {
    short: "AWARE",
    name: "Adaptive Selective Preemption",
    type: "Selectively preemptive",
    rule: "Preempts only when the remaining-time gain reaches the threshold.",
  },
};

function cloneProcesses(processes) {
  return processes.map((process, index) => ({
    ...process,
    index,
    remaining: process.burst,
    completion: null,
  }));
}

function minimumBy(ready, value) {
  return [...ready].sort((a, b) =>
    value(a) - value(b) || a.arrival - b.arrival || a.index - b.index,
  )[0];
}

function finishSchedule(key, list, timeline) {
  const metrics = list.map((process) => {
    const firstStart = timeline.indexOf(process.id);
    const completion = process.completion;
    const turnaround = completion - process.arrival;
    return {
      ...process,
      firstStart,
      completion,
      turnaround,
      waiting: turnaround - process.burst,
      response: firstStart - process.arrival,
    };
  });

  const gantt = [];
  timeline.forEach((id, time) => {
    const label = id ?? "IDLE";
    const previous = gantt[gantt.length - 1];
    if (previous && previous.id === label) previous.end = time + 1;
    else gantt.push({ id: label, start: time, end: time + 1 });
  });

  const activeBlocks = gantt.filter((block) => block.id !== "IDLE");
  return {
    key,
    timeline,
    gantt,
    metrics,
    makespan: timeline.length,
    avgWaiting: metrics.reduce((sum, p) => sum + p.waiting, 0) / metrics.length,
    avgTurnaround: metrics.reduce((sum, p) => sum + p.turnaround, 0) / metrics.length,
    avgResponse: metrics.reduce((sum, p) => sum + p.response, 0) / metrics.length,
    maxWaiting: Math.max(...metrics.map((p) => p.waiting)),
    contextSwitches: Math.max(0, activeBlocks.length - 1),
  };
}

function scheduleSJF(processes) {
  const list = cloneProcesses(processes);
  const timeline = [];
  let completed = 0;
  let time = 0;

  while (completed < list.length) {
    const ready = list.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!ready.length) {
      timeline.push(null);
      time += 1;
      continue;
    }
    const selected = minimumBy(ready, (p) => p.burst);
    for (let unit = 0; unit < selected.burst; unit += 1) timeline.push(selected.id);
    time += selected.burst;
    selected.remaining = 0;
    selected.completion = time;
    completed += 1;
  }
  return finishSchedule("sjf", list, timeline);
}

function scheduleSRTF(processes) {
  const list = cloneProcesses(processes);
  const timeline = [];
  let completed = 0;
  let time = 0;

  while (completed < list.length) {
    const ready = list.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!ready.length) {
      timeline.push(null);
      time += 1;
      continue;
    }
    const selected = minimumBy(ready, (p) => p.remaining);
    timeline.push(selected.id);
    selected.remaining -= 1;
    time += 1;
    if (selected.remaining === 0) {
      selected.completion = time;
      completed += 1;
    }
  }
  return finishSchedule("srtf", list, timeline);
}

function scheduleHRRN(processes) {
  const list = cloneProcesses(processes);
  const timeline = [];
  let completed = 0;
  let time = 0;

  while (completed < list.length) {
    const ready = list.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!ready.length) {
      timeline.push(null);
      time += 1;
      continue;
    }
    const selected = [...ready].sort((a, b) => {
      const ratioA = (time - a.arrival + a.burst) / a.burst;
      const ratioB = (time - b.arrival + b.burst) / b.burst;
      return ratioB - ratioA || a.arrival - b.arrival || a.index - b.index;
    })[0];
    for (let unit = 0; unit < selected.burst; unit += 1) timeline.push(selected.id);
    time += selected.burst;
    selected.remaining = 0;
    selected.completion = time;
    completed += 1;
  }
  return finishSchedule("hrrn", list, timeline);
}

function scheduleAWARE(processes, threshold) {
  const list = cloneProcesses(processes);
  const timeline = [];
  let current = null;
  let completed = 0;
  let time = 0;

  while (completed < list.length) {
    const ready = list.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!ready.length) {
      timeline.push(null);
      current = null;
      time += 1;
      continue;
    }

    const shortest = minimumBy(ready, (p) => p.remaining);
    if (!current || current.remaining === 0) current = shortest;
    else if (
      shortest.id !== current.id &&
      current.remaining - shortest.remaining >= threshold
    ) current = shortest;

    timeline.push(current.id);
    current.remaining -= 1;
    time += 1;
    if (current.remaining === 0) {
      current.completion = time;
      completed += 1;
      current = null;
    }
  }
  return finishSchedule("aware", list, timeline);
}

function getLiveState(result, processes, time, starvationLimit) {
  const runningId = time < result.makespan ? result.timeline[time] : null;
  const states = processes.map((process, index) => {
    const metric = result.metrics.find((item) => item.id === process.id);
    const executed = result.timeline.slice(0, time).filter((id) => id === process.id).length;
    const remaining = Math.max(0, process.burst - executed);
    const completed = metric.completion <= time;
    const waiting = completed
      ? metric.waiting
      : Math.max(0, time - process.arrival - executed);
    let status = "incoming";
    if (completed) status = "completed";
    else if (process.id === runningId) status = "running";
    else if (process.arrival <= time) status = "ready";
    return {
      ...process,
      index,
      metric,
      remaining,
      waiting,
      status,
      risk: status === "ready" && waiting >= starvationLimit,
    };
  });
  return {
    runningId,
    states,
    incoming: states.filter((p) => p.status === "incoming"),
    ready: states.filter((p) => p.status === "ready"),
    running: states.filter((p) => p.status === "running"),
    completed: states.filter((p) => p.status === "completed"),
    risks: states.filter((p) => p.risk),
  };
}

function ProcessChip({ process, compact = false }) {
  const color = PROCESS_COLORS[process.index % PROCESS_COLORS.length];
  return (
    <div className={`process-chip ${process.risk ? "at-risk" : ""} ${compact ? "compact" : ""}`} style={{ "--process": color }}>
      <div className="process-id"><span />{process.id}</div>
      {!compact && (
        <div className="process-stats">
          <span>remaining <b>{process.remaining}</b></span>
          <span>waited <b>{process.waiting}</b></span>
        </div>
      )}
      {process.risk && <div className="risk-label">starvation risk</div>}
    </div>
  );
}

function QueueZone({ title, subtitle, className = "", children, empty }) {
  return (
    <section className={`queue-zone ${className}`}>
      <header><h3>{title}</h3><span>{subtitle}</span></header>
      <div className="queue-content">{children || <p className="empty-state">{empty}</p>}</div>
    </section>
  );
}

function DonutChart({ waiting, burst, color }) {
  const total = waiting + burst;
  const share = total ? waiting / total : 0;
  const circumference = 2 * Math.PI * 36;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 88 88" role="img" aria-label={`${Math.round(share * 100)} percent waiting share`}>
        <circle className="donut-track" cx="44" cy="44" r="36" />
        <circle
          className="donut-value"
          cx="44" cy="44" r="36"
          style={{ stroke: color, strokeDasharray: `${share * circumference} ${circumference}` }}
        />
      </svg>
      <div><strong>{Math.round(share * 100)}%</strong><span>waiting share</span></div>
    </div>
  );
}

function App() {
  const [processes, setProcesses] = useState(DEFAULT_PROCESSES);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("aware");
  const [awareThreshold, setAwareThreshold] = useState(2);
  const [starvationLimit, setStarvationLimit] = useState(8);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);

  const results = useMemo(() => ({
    sjf: scheduleSJF(processes),
    srtf: scheduleSRTF(processes),
    hrrn: scheduleHRRN(processes),
    aware: scheduleAWARE(processes, awareThreshold),
  }), [processes, awareThreshold]);

  const result = results[selectedAlgorithm];
  const live = useMemo(
    () => getLiveState(result, processes, time, starvationLimit),
    [result, processes, time, starvationLimit],
  );

  useEffect(() => {
    setPlaying(false);
    setTime(0);
  }, [selectedAlgorithm, processes, awareThreshold]);

  useEffect(() => {
    if (!playing) return undefined;
    if (time >= result.makespan) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setTime((value) => value + 1), speed);
    return () => window.clearTimeout(timer);
  }, [playing, time, speed, result.makespan]);

  const eventMessage = useMemo(() => {
    if (time >= result.makespan) return "All processes have completed. Review the performance summary below.";
    const arriving = processes.filter((p) => p.arrival === time).map((p) => p.id);
    const now = result.timeline[time];
    const before = time > 0 ? result.timeline[time - 1] : null;
    if (arriving.length) return `${arriving.join(", ")} arrived. CPU is executing ${now ?? "an idle cycle"}.`;
    if (before && now && before !== now) return `${before} left the CPU; ${now} is now running.`;
    return now ? `${now} continues for clock interval ${time}–${time + 1}.` : "CPU is idle, waiting for a process to arrive.";
  }, [time, result, processes]);

  const updateProcess = (index, field, value) => {
    const numeric = Math.max(field === "burst" ? 1 : 0, Number(value) || 0);
    setProcesses((items) => items.map((item, i) => i === index ? { ...item, [field]: numeric } : item));
  };

  const addProcess = () => {
    if (processes.length >= 7) return;
    setProcesses((items) => [...items, { id: `P${items.length + 1}`, arrival: 0, burst: 3 }]);
  };

  const removeProcess = (index) => {
    if (processes.length <= 2) return;
    setProcesses((items) => items.filter((_, i) => i !== index).map((item, i) => ({ ...item, id: `P${i + 1}` })));
  };

  const totalBurst = processes.reduce((sum, p) => sum + p.burst, 0);
  const maxAverage = Math.max(...Object.values(results).map((item) => item.avgTurnaround), 1);

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">A</span><span>AWARE <small>Scheduling Lab</small></span></a>
        <div className="nav-links"><a href="#simulator">Simulator</a><a href="#comparison">Comparison</a><a href="#workload">Workload</a></div>
        <span className="live-badge"><i /> interactive model</span>
      </nav>

      <header className="hero" id="top">
        <div className="eyebrow">UNIPROCESSOR • VISUAL EXPLORER</div>
        <h1>Watch CPU scheduling<br /><em>one clock tick at a time.</em></h1>
        <p>See processes arrive, wait, run, get preempted, and complete. Compare traditional schedulers with your selective-preemption AWARE algorithm.</p>
        <div className="hero-metrics">
          <div><strong>4</strong><span>algorithms</span></div>
          <div><strong>{processes.length}</strong><span>processes</span></div>
          <div><strong>{totalBurst}</strong><span>CPU units</span></div>
          <div><strong>T={awareThreshold}</strong><span>AWARE threshold</span></div>
        </div>
      </header>

      <section className="section simulator-section" id="simulator">
        <div className="section-heading">
          <div><span className="section-number">01</span><div><h2>Live scheduler</h2><p>Select an algorithm, then play or step through its decisions.</p></div></div>
          <div className="algorithm-tabs" role="tablist">
            {Object.entries(ALGORITHMS).map(([key, algorithm]) => (
              <button key={key} className={selectedAlgorithm === key ? "active" : ""} onClick={() => setSelectedAlgorithm(key)}>{algorithm.short}</button>
            ))}
          </div>
        </div>

        <div className="algorithm-strip">
          <div><span>{ALGORITHMS[selectedAlgorithm].type}</span><h3>{ALGORITHMS[selectedAlgorithm].name}</h3><p>{ALGORITHMS[selectedAlgorithm].rule}</p></div>
          {selectedAlgorithm === "aware" && (
            <label className="threshold-control">Preemption threshold <strong>{awareThreshold}</strong><input type="range" min="1" max="6" value={awareThreshold} onChange={(e) => setAwareThreshold(Number(e.target.value))} /></label>
          )}
          <label className="threshold-control">Risk after <strong>{starvationLimit} ticks</strong><input type="range" min="3" max="15" value={starvationLimit} onChange={(e) => setStarvationLimit(Number(e.target.value))} /></label>
        </div>

        <div className="transport">
          <div className="clock"><span>system clock</span><strong>{time.toString().padStart(2, "0")}</strong><small>/ {result.makespan}</small></div>
          <div className="transport-buttons">
            <button className="icon-button" onClick={() => { setPlaying(false); setTime(0); }} aria-label="Reset">↺</button>
            <button className="play-button" onClick={() => { if (time >= result.makespan) setTime(0); setPlaying((value) => !value); }}>{playing ? "Pause" : "Play simulation"}</button>
            <button className="icon-button" onClick={() => { setPlaying(false); setTime((value) => Math.min(result.makespan, value + 1)); }} aria-label="Step forward">→</button>
          </div>
          <label className="speed-control">Speed<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value="1200">0.5×</option><option value="700">1×</option><option value="350">2×</option><option value="160">4×</option></select></label>
        </div>

        <div className="event-line"><span>{time >= result.makespan ? "✓" : "i"}</span>{eventMessage}</div>
        {live.risks.length > 0 && <div className="starvation-alert"><strong>Starvation warning</strong><span>{live.risks.map((p) => p.id).join(", ")} {live.risks.length > 1 ? "have" : "has"} waited at least {starvationLimit} ticks in the ready queue.</span></div>}

        <div className="queue-board">
          <QueueZone title="Incoming" subtitle={`${live.incoming.length} not arrived`} empty="No future arrivals">
            {live.incoming.map((p) => <ProcessChip key={p.id} process={p} compact />)}
          </QueueZone>
          <div className="flow-arrow">→</div>
          <QueueZone title="Ready queue" subtitle={`${live.ready.length} waiting`} className="ready-zone" empty="Queue is empty">
            {live.ready.map((p) => <ProcessChip key={p.id} process={p} />)}
          </QueueZone>
          <div className="flow-arrow">→</div>
          <QueueZone title="CPU" subtitle="one processor" className="cpu-zone" empty="CPU idle">
            {live.running.map((p) => <ProcessChip key={p.id} process={p} />)}
          </QueueZone>
          <div className="flow-arrow">→</div>
          <QueueZone title="Completed" subtitle={`${live.completed.length}/${processes.length} finished`} empty="Nothing finished yet">
            {live.completed.map((p) => <ProcessChip key={p.id} process={p} compact />)}
          </QueueZone>
        </div>

        <div className="gantt-panel">
          <div className="panel-title"><div><h3>Execution timeline</h3><p>Highlighted blocks have already executed.</p></div><span>{result.contextSwitches} context switches</span></div>
          <div className="gantt-chart">
            {result.gantt.map((block, index) => {
              const processIndex = processes.findIndex((p) => p.id === block.id);
              const completedWidth = Math.max(0, Math.min(block.end, time) - block.start) / (block.end - block.start) * 100;
              return (
                <div key={`${block.id}-${block.start}`} className="gantt-block" style={{ flex: block.end - block.start, "--process": processIndex >= 0 ? PROCESS_COLORS[processIndex % PROCESS_COLORS.length] : "#526272" }}>
                  <div className="gantt-progress" style={{ width: `${completedWidth}%` }} />
                  <strong>{block.id}</strong><span>{block.start}</span>{index === result.gantt.length - 1 && <span className="end-time">{block.end}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section comparison-section" id="comparison">
        <div className="section-heading"><div><span className="section-number">02</span><div><h2>Performance comparison</h2><p>Every result uses the exact same workload shown below.</p></div></div></div>

        <div className="metric-cards">
          {Object.entries(results).map(([key, item]) => (
            <article className={`metric-card ${key === "aware" ? "featured" : ""}`} key={key}>
              <header><span>{ALGORITHMS[key].type}</span><h3>{ALGORITHMS[key].short}</h3></header>
              <DonutChart waiting={item.avgWaiting} burst={totalBurst / processes.length} color={key === "aware" ? "#57e3b4" : "#ffb454"} />
              <dl><div><dt>Avg. waiting</dt><dd>{item.avgWaiting.toFixed(2)}</dd></div><div><dt>Avg. turnaround</dt><dd>{item.avgTurnaround.toFixed(2)}</dd></div><div><dt>Context switches</dt><dd>{item.contextSwitches}</dd></div><div><dt>Longest wait</dt><dd>{item.maxWaiting}</dd></div></dl>
            </article>
          ))}
        </div>

        <div className="chart-grid">
          <article className="comparison-chart">
            <div className="panel-title"><div><h3>Average time comparison</h3><p>Lower bars indicate faster service.</p></div><div className="legend"><span className="wait-key">waiting</span><span className="tat-key">turnaround</span></div></div>
            <div className="bar-chart">
              {Object.entries(results).map(([key, item]) => (
                <div className="bar-group" key={key}>
                  <div className="bars"><div className="bar waiting-bar" style={{ height: `${item.avgWaiting / maxAverage * 100}%` }}><span>{item.avgWaiting.toFixed(1)}</span></div><div className="bar tat-bar" style={{ height: `${item.avgTurnaround / maxAverage * 100}%` }}><span>{item.avgTurnaround.toFixed(1)}</span></div></div>
                  <strong>{ALGORITHMS[key].short}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="starvation-chart">
            <div className="panel-title"><div><h3>Starvation lens</h3><p>A risk means final waiting time reached {starvationLimit} ticks.</p></div></div>
            <div className="risk-table">
              {Object.entries(results).map(([key, item]) => {
                const risky = item.metrics.filter((p) => p.waiting >= starvationLimit);
                return <div className="risk-row" key={key}><strong>{ALGORITHMS[key].short}</strong><div className="risk-dots">{processes.map((p, index) => { const metric = item.metrics.find((m) => m.id === p.id); return <span key={p.id} className={metric.waiting >= starvationLimit ? "danger" : "safe"} title={`${p.id}: waited ${metric.waiting}`}>{p.id}</span>; })}</div><b>{risky.length} at risk</b></div>;
              })}
            </div>
            <p className="chart-note">A finite example eventually completes every process. The warning visualizes prolonged waiting—the condition that can become starvation under a continuous stream of short jobs.</p>
          </article>
        </div>

        <div className="result-table-wrap">
          <table className="result-table"><thead><tr><th>Algorithm</th><th>Avg. WT</th><th>Avg. TAT</th><th>Avg. response</th><th>Max wait</th><th>Switches</th><th>Risk count</th></tr></thead><tbody>{Object.entries(results).map(([key, item]) => <tr key={key} className={key === "aware" ? "aware-row" : ""}><td><strong>{ALGORITHMS[key].short}</strong><span>{ALGORITHMS[key].type}</span></td><td>{item.avgWaiting.toFixed(2)}</td><td>{item.avgTurnaround.toFixed(2)}</td><td>{item.avgResponse.toFixed(2)}</td><td>{item.maxWaiting}</td><td>{item.contextSwitches}</td><td>{item.metrics.filter((p) => p.waiting >= starvationLimit).length}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="section workload-section" id="workload">
        <div className="section-heading"><div><span className="section-number">03</span><div><h2>Workload laboratory</h2><p>Edit arrival and burst times, then replay every algorithm instantly.</p></div></div><div className="workload-actions"><button onClick={() => setProcesses(DEFAULT_PROCESSES)}>Reset example</button><button className="primary-small" onClick={addProcess} disabled={processes.length >= 7}>+ Add process</button></div></div>
        <div className="process-editor">
          <div className="editor-head"><span>Process</span><span>Arrival time</span><span>Burst time</span><span /></div>
          {processes.map((process, index) => <div className="editor-row" key={process.id}><strong style={{ "--process": PROCESS_COLORS[index % PROCESS_COLORS.length] }}><i />{process.id}</strong><input aria-label={`${process.id} arrival time`} type="number" min="0" max="30" value={process.arrival} onChange={(e) => updateProcess(index, "arrival", e.target.value)} /><input aria-label={`${process.id} burst time`} type="number" min="1" max="30" value={process.burst} onChange={(e) => updateProcess(index, "burst", e.target.value)} /><button aria-label={`Remove ${process.id}`} onClick={() => removeProcess(index)} disabled={processes.length <= 2}>×</button></div>)}
        </div>
        <div className="formula-grid">
          <div><span>Turnaround time</span><code>TAT = CT − AT</code></div><div><span>Waiting time</span><code>WT = TAT − BT</code></div><div><span>HRRN ratio</span><code>(WT + BT) / BT</code></div><div className="aware-formula"><span>AWARE preemption</span><code>R(current) − R(new) ≥ T</code></div>
        </div>
      </section>

      <footer><div className="brand"><span className="brand-mark">A</span><span>AWARE <small>Scheduling Lab</small></span></div><p>Adaptive Waiting, Aging and Resource-Efficient Scheduling • Educational prototype</p></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
