import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ReplayData, GameState, HexCell, Player, ClimateEvent, Species, CLIMATE_ICONS } from '../types';
import HexMap from './HexMap';

interface ReplayProps {
  replayData: ReplayData;
  onBack: () => void;
}

const CHART_W = 460;
const CHART_H = 160;
const CHART_PAD_L = 45;
const CHART_PAD_R = 15;
const CHART_PAD_T = 20;
const CHART_PAD_B = 30;

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a1628',
    color: '#e0e6ed',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#0d1b2e',
    borderBottom: '1px solid #1a3a5c',
    gap: '12px',
    flexShrink: 0,
  },
  backBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #1a3a5c',
    background: '#0a1628',
    color: '#8899aa',
    fontSize: '13px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#2ecc71',
  },
  turnLabel: {
    fontSize: '14px',
    color: '#8899aa',
    marginLeft: 'auto',
  },
  turnNum: {
    color: '#2ecc71',
    fontWeight: 700,
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  mapArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  mapContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 20px',
    background: '#0d1b2e',
    borderTop: '1px solid #1a3a5c',
    flexShrink: 0,
  },
  playBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    color: '#0a1628',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  slider: {
    flex: 1,
    WebkitAppearance: 'none' as any,
    appearance: 'none' as any,
    height: '6px',
    borderRadius: '3px',
    background: '#1a3a5c',
    outline: 'none',
    cursor: 'pointer',
  },
  speedLabel: {
    fontSize: '12px',
    color: '#5a7a9a',
    flexShrink: 0,
  },
  sidebar: {
    width: '500px',
    background: '#0d1b2e',
    borderLeft: '1px solid #1a3a5c',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    gap: '12px',
  },
  chartCard: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '12px',
  },
  chartTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#5a7a9a',
    marginBottom: '8px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  eventOverlay: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    background: 'rgba(10, 22, 40, 0.92)',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    zIndex: 10,
    maxWidth: '220px',
  },
  eventTitle: {
    color: '#f39c12',
    fontWeight: 700,
    fontSize: '12px',
    marginBottom: '4px',
  },
  eventItem: {
    color: '#e0e6ed',
    fontSize: '12px',
    marginBottom: '2px',
  },
  collapseOverlay: {
    position: 'absolute' as const,
    top: '12px',
    left: '12px',
    background: 'rgba(10, 22, 40, 0.92)',
    border: '1px solid #e74c3c',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    zIndex: 10,
    maxWidth: '220px',
  },
  collapseTitle: {
    color: '#e74c3c',
    fontWeight: 700,
    fontSize: '12px',
    marginBottom: '4px',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '6px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#8899aa',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
};

function calculateShannonWiener(cell: HexCell): number {
  const total = cell.populations.reduce((s, p) => s + p.count, 0);
  if (total <= 0) return 0;
  return cell.populations
    .filter(p => p.count > 0)
    .reduce((sum, p) => {
      const pi = p.count / total;
      return sum - pi * Math.log(pi);
    }, 0);
}

function computeTerritoryData(snapshots: ReplayData['snapshots']) {
  const playerTerritory: Record<string, { name: string; color: string; data: number[] }> = {};
  const turns: number[] = [];

  for (const snap of snapshots) {
    turns.push(snap.turn_number);
    const cellCounts: Record<string, number> = {};

    for (const cell of Object.values(snap.state.cells)) {
      if (cell.owner_id) {
        cellCounts[cell.owner_id] = (cellCounts[cell.owner_id] || 0) + 1;
      }
    }

    for (const [pid, player] of Object.entries(snap.state.players)) {
      if (!playerTerritory[pid]) {
        playerTerritory[pid] = { name: player.name, color: player.color, data: [] };
      }
      playerTerritory[pid].data.push(cellCounts[pid] || 0);
    }
  }

  return { playerTerritory, turns };
}

function computeBiodiversityData(snapshots: ReplayData['snapshots']) {
  const playerBio: Record<string, { name: string; color: string; data: number[] }> = {};
  const turns: number[] = [];

  for (const snap of snapshots) {
    turns.push(snap.turn_number);

    for (const [pid, player] of Object.entries(snap.state.players)) {
      if (!playerBio[pid]) {
        playerBio[pid] = { name: player.name, color: player.color, data: [] };
      }

      const playerCells = Object.values(snap.state.cells).filter(c => c.owner_id === pid);
      if (playerCells.length === 0) {
        playerBio[pid].data.push(0);
      } else {
        const avgShannon = playerCells.reduce((s, c) => s + calculateShannonWiener(c), 0) / playerCells.length;
        playerBio[pid].data.push(Math.round(avgShannon * 100) / 100);
      }
    }
  }

  return { playerBio, turns };
}

function computeTopSpecies(finalState: GameState): { name: string; count: number; color: string }[] {
  const speciesTotals: Record<string, { name: string; count: number; trophic: string }> = {};

  for (const cell of Object.values(finalState.cells)) {
    for (const pop of cell.populations) {
      if (!speciesTotals[pop.species_id]) {
        const sp = finalState.species_catalog.find(s => s.id === pop.species_id);
        speciesTotals[pop.species_id] = {
          name: sp ? sp.name : pop.species_id.slice(0, 6),
          count: 0,
          trophic: sp ? sp.trophic_level : 'Producer',
        };
      }
      speciesTotals[pop.species_id].count += pop.count;
    }
  }

  const trophicColorMap: Record<string, string> = {
    Producer: '#2ecc71',
    PrimaryConsumer: '#f39c12',
    SecondaryConsumer: '#e74c3c',
    Decomposer: '#9b59b6',
  };

  return Object.values(speciesTotals)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(s => ({ name: s.name, count: Math.round(s.count), color: trophicColorMap[s.trophic] || '#3498db' }));
}

function computeClimateTimeline(snapshots: ReplayData['snapshots']): { turn: number; events: ClimateEvent[] }[] {
  const timeline: { turn: number; events: ClimateEvent[] }[] = [];

  for (const snap of snapshots) {
    const active = snap.state.climate.active_events;
    if (active && active.length > 0) {
      timeline.push({ turn: snap.turn_number, events: active });
    }
  }

  return timeline;
}

function findCollapsesForTurn(state: GameState): { cell: [number, number]; cause: string }[] {
  const collapses: { cell: [number, number]; cause: string }[] = [];
  for (const cell of Object.values(state.cells)) {
    if (cell.collapse_state.is_collapsed) {
      const cause = cell.collapse_state.missing_trophic_levels.join(', ');
      collapses.push({ cell: [cell.q, cell.r], cause });
    }
  }
  return collapses;
}

function LineChart({ data, turns, yLabel }: {
  data: Record<string, { name: string; color: string; data: number[] }>;
  turns: number[];
  yLabel: string;
}) {
  const plotW = CHART_W - CHART_PAD_L - CHART_PAD_R;
  const plotH = CHART_H - CHART_PAD_T - CHART_PAD_B;

  const entries = Object.values(data);
  if (entries.length === 0 || turns.length === 0) return null;

  let maxVal = 0;
  for (const e of entries) {
    for (const v of e.data) {
      if (v > maxVal) maxVal = v;
    }
  }
  maxVal = Math.max(maxVal, 1);

  const xScale = (i: number) => CHART_PAD_L + (i / Math.max(turns.length - 1, 1)) * plotW;
  const yScale = (v: number) => CHART_PAD_T + plotH - (v / maxVal) * plotH;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round(maxVal * i / yTicks));

  return (
    <svg width={CHART_W} height={CHART_H} style={{ display: 'block' }}>
      {yTickValues.map(v => (
        <g key={v}>
          <line
            x1={CHART_PAD_L} y1={yScale(v)} x2={CHART_W - CHART_PAD_R} y2={yScale(v)}
            stroke="#1a3a5c" strokeWidth={0.5}
          />
          <text x={CHART_PAD_L - 4} y={yScale(v) + 3} textAnchor="end" fontSize="9" fill="#5a7a9a">
            {v}
          </text>
        </g>
      ))}

      <text x={CHART_PAD_L + plotW / 2} y={CHART_H - 2} textAnchor="middle" fontSize="9" fill="#5a7a9a">
        Turn
      </text>
      <text x={8} y={CHART_PAD_T + plotH / 2} textAnchor="middle" fontSize="9" fill="#5a7a9a"
        transform={`rotate(-90, 8, ${CHART_PAD_T + plotH / 2})`}>
        {yLabel}
      </text>

      {entries.map(entry => {
        const points = entry.data.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
        return (
          <g key={entry.name}>
            <polyline
              points={points}
              fill="none"
              stroke={entry.color}
              strokeWidth={1.5}
              opacity={0.85}
            />
            {entry.data.map((v, i) => (
              <circle key={i} cx={xScale(i)} cy={yScale(v)} r={2} fill={entry.color} opacity={0.6} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data }: { data: { name: string; count: number; color: string }[] }) {
  if (data.length === 0) return null;

  const barH = 14;
  const gap = 4;
  const labelW = 90;
  const svgH = data.length * (barH + gap) + CHART_PAD_T + CHART_PAD_B;
  const plotW = CHART_W - CHART_PAD_L - labelW - CHART_PAD_R;
  const maxVal = Math.max(...data.map(d => d.count), 1);

  return (
    <svg width={CHART_W} height={svgH} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const y = CHART_PAD_T + i * (barH + gap);
        const w = (d.count / maxVal) * plotW;
        return (
          <g key={d.name}>
            <text x={CHART_PAD_L + labelW - 4} y={y + barH / 2 + 3} textAnchor="end" fontSize="10" fill="#8899aa">
              {d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name}
            </text>
            <rect
              x={CHART_PAD_L + labelW} y={y} width={w} height={barH}
              fill={d.color} opacity={0.8} rx={2}
            />
            <text x={CHART_PAD_L + labelW + w + 4} y={y + barH / 2 + 3} fontSize="9" fill="#5a7a9a">
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ClimateTimeline({ events, maxTurn }: { events: { turn: number; events: ClimateEvent[] }[]; maxTurn: number }) {
  const svgH = 50;
  const plotW = CHART_W - CHART_PAD_L - CHART_PAD_R;

  return (
    <svg width={CHART_W} height={svgH} style={{ display: 'block' }}>
      <line
        x1={CHART_PAD_L} y1={svgH / 2} x2={CHART_PAD_L + plotW} y2={svgH / 2}
        stroke="#1a3a5c" strokeWidth={1}
      />

      {events.map((ev, i) => {
        const x = CHART_PAD_L + (ev.turn / Math.max(maxTurn, 1)) * plotW;
        const icon = ev.events[0] ? (CLIMATE_ICONS[ev.events[0].type] || '⚡') : '⚡';
        return (
          <g key={i}>
            <line x1={x} y1={svgH / 2 - 10} x2={x} y2={svgH / 2 + 10} stroke="#f39c12" strokeWidth={1} />
            <text x={x} y={svgH / 2 - 14} textAnchor="middle" fontSize="11">{icon}</text>
            <text x={x} y={svgH / 2 + 20} textAnchor="middle" fontSize="8" fill="#5a7a9a">
              T{ev.turn}
            </text>
          </g>
        );
      })}

      <text x={CHART_PAD_L} y={svgH - 2} fontSize="8" fill="#5a7a9a">0</text>
      <text x={CHART_PAD_L + plotW} y={svgH - 2} textAnchor="end" fontSize="8" fill="#5a7a9a">{maxTurn}</text>
    </svg>
  );
}

export default function Replay({ replayData, onBack }: ReplayProps) {
  const { snapshots } = replayData;
  const maxTurn = snapshots.length > 0 ? snapshots[snapshots.length - 1].turn_number : 0;
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentSnapshot = snapshots[currentTurnIdx] || null;
  const currentGameState = currentSnapshot?.state || null;

  const territoryData = useMemo(() => computeTerritoryData(snapshots), [snapshots]);
  const biodiversityData = useMemo(() => computeBiodiversityData(snapshots), [snapshots]);
  const topSpecies = useMemo(() => {
    if (snapshots.length === 0) return [];
    return computeTopSpecies(snapshots[snapshots.length - 1].state);
  }, [snapshots]);
  const climateTimeline = useMemo(() => computeClimateTimeline(snapshots), [snapshots]);

  const collapses = useMemo(() => {
    if (!currentGameState) return [];
    return findCollapsesForTurn(currentGameState);
  }, [currentGameState]);

  const climateEventsNow = useMemo(() => {
    if (!currentGameState) return [];
    return currentGameState.climate.active_events || [];
  }, [currentGameState]);

  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentTurnIdx(prev => {
          if (prev >= snapshots.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, snapshots.length]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    setCurrentTurnIdx(idx);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (currentTurnIdx >= snapshots.length - 1) {
      setCurrentTurnIdx(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [currentTurnIdx, snapshots.length]);

  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null);

  if (!currentGameState) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={onBack}>← Back</button>
          <span style={styles.title}>Replay</span>
          <span style={{ color: '#5a7a9a', fontSize: '13px' }}>No snapshot data available</span>
        </div>
      </div>
    );
  }

  const playerEntries = Object.values(territoryData.playerTerritory);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
        <span style={styles.title}>Replay: {currentGameState.name}</span>
        <span style={styles.turnLabel}>
          Turn <span style={styles.turnNum}>{currentSnapshot?.turn_number ?? 0}</span> / {maxTurn}
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.mapArea}>
          <div style={styles.mapContent}>
            <HexMap
              cells={currentGameState.cells}
              players={currentGameState.players}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
              climate={currentGameState.climate}
              speciesCatalog={currentGameState.species_catalog}
            />

            {climateEventsNow.length > 0 && (
              <div style={styles.eventOverlay}>
                <div style={styles.eventTitle}>Climate Events</div>
                {climateEventsNow.map((ev, i) => (
                  <div key={i} style={styles.eventItem}>
                    {CLIMATE_ICONS[ev.type] || '⚡'} {ev.type}
                    {ev.target_trophic ? ` → ${ev.target_trophic}` : ''}
                  </div>
                ))}
              </div>
            )}

            {collapses.length > 0 && (
              <div style={styles.collapseOverlay}>
                <div style={styles.collapseTitle}>Collapse Events ({collapses.length})</div>
                {collapses.slice(0, 5).map((c, i) => (
                  <div key={i} style={styles.eventItem}>
                    ({c.cell[0]},{c.cell[1]}): {c.cause}
                  </div>
                ))}
                {collapses.length > 5 && (
                  <div style={{ ...styles.eventItem, color: '#5a7a9a' }}>
                    +{collapses.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={styles.controls}>
            <button style={styles.playBtn} onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(snapshots.length - 1, 0)}
              value={currentTurnIdx}
              onChange={handleSliderChange}
              style={styles.slider}
            />
            <span style={styles.speedLabel}>1s/turn</span>
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.chartCard}>
            <div style={styles.chartTitle}>Territory Area Over Time</div>
            <div style={styles.legend}>
              {playerEntries.map(p => (
                <div key={p.name} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, background: p.color }} />
                  {p.name}
                </div>
              ))}
            </div>
            <LineChart data={territoryData.playerTerritory} turns={territoryData.turns} yLabel="Cells" />
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartTitle}>Biodiversity Index (Shannon-Wiener)</div>
            <div style={styles.legend}>
              {Object.values(biodiversityData.playerBio).map(p => (
                <div key={p.name} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, background: p.color }} />
                  {p.name}
                </div>
              ))}
            </div>
            <LineChart data={biodiversityData.playerBio} turns={biodiversityData.turns} yLabel="H'" />
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartTitle}>Top 10 Species by Population</div>
            <BarChart data={topSpecies} />
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartTitle}>Climate Event Timeline</div>
            {climateTimeline.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#5a7a9a', padding: '8px 0' }}>
                No climate events recorded
              </div>
            ) : (
              <ClimateTimeline events={climateTimeline} maxTurn={maxTurn} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
