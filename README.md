# AWARE CPU Scheduling Simulator

An interactive React application for visualizing and comparing four uniprocessor CPU scheduling algorithms:

- SJF — Shortest Job First
- SRTF — Shortest Remaining Time First
- HRRN — Highest Response Ratio Next
- AWARE — a proposed selective-preemption scheduling algorithm

The simulator animates processes as they move from the incoming queue to the ready queue, CPU, and completed queue. It also highlights prolonged waiting and compares algorithm performance through Gantt charts and visual metrics.

## Live demo

[Open the deployed simulator](https://os-project-omega-three.vercel.app/)



## Features

- Clock-by-clock scheduling animation
- Play, pause, reset, step, and speed controls
- Incoming, ready, running, and completed process queues
- Live remaining-time and waiting-time values
- Configurable starvation-risk warning threshold
- Animated Gantt timeline
- Average waiting, turnaround, and response times
- Context-switch and maximum-wait comparison
- Donut charts, bar charts, and a detailed comparison table
- Editable arrival and burst times
- Adjustable AWARE preemption threshold
- Responsive desktop and mobile layout

## AWARE prototype

The current AWARE prototype starts from the process with the shortest remaining time but only preempts the running process when the improvement is large enough:

```text
R(current) - R(new) >= T
```

Here, `T` is a configurable preemption threshold. This selective-preemption rule is intended to avoid context switches that produce only a small remaining-time improvement.

> Note: The current prototype implements selective preemption. Waiting-time aging and an adaptive threshold are planned extensions and are not yet part of the scheduling decision.

## Default workload

| Process | Arrival time | Burst time |
| --- | ---: | ---: |
| P1 | 0 | 8 |
| P2 | 1 | 6 |
| P3 | 2 | 2 |
| P4 | 3 | 4 |
| P5 | 5 | 1 |

With an AWARE threshold of `2`, the default comparison is:

| Algorithm | Average waiting | Average turnaround | Context switches |
| --- | ---: | ---: | ---: |
| SJF | 6.40 | 10.60 | 4 |
| SRTF | 4.40 | 8.60 | 7 |
| HRRN | 6.60 | 10.80 | 4 |
| AWARE | 4.60 | 8.80 | 6 |

## Run locally

### Requirements

- Node.js 20.19 or newer
- npm

### Installation

```bash
git clone <your-repository-url>
cd aware-scheduler-simulator
npm install
npm run dev
```

Open the local address printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

The optimized site is generated in `dist/`.

## Project structure

```text
aware-scheduler-simulator/
├── .github/workflows/ci.yml  # GitHub build verification
├── .openai/hosting.json      # ChatGPT Sites deployment configuration
├── src/
│   ├── main.jsx              # Scheduling engines and React interface
│   └── styles.css            # Responsive visual design
├── index.html
├── package.json
└── package-lock.json
```

## Scheduling calculations

```text
Turnaround Time = Completion Time - Arrival Time
Waiting Time    = Turnaround Time - Burst Time
Response Time   = First Start Time - Arrival Time
HRRN Ratio      = (Waiting Time + Burst Time) / Burst Time
```

## Starvation-risk indicator

A finite simulation eventually completes every process, so it does not prove infinite starvation. The interface instead marks a process as **at risk** when its waiting time reaches the selected warning threshold. This demonstrates the prolonged-waiting condition that can become starvation when new short jobs continue to arrive.

## Future improvements

- Add waiting-time aging to the AWARE scheduling score
- Make the preemption threshold adaptive to ready-queue conditions
- Model nonzero context-switch overhead
- Add workload presets and result export
- Add automated unit tests for each scheduling engine

## Demo Link : https://os-project-omega-three.vercel.app/
