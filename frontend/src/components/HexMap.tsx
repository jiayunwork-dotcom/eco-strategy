import React, { useMemo, useEffect, useState } from 'react';
import { HexCell, Player, ClimateState, Species, BIOME_COLORS, CLIMATE_ICONS } from '../types';

interface HexMapProps {
  cells: Record<string, HexCell>;
  players: Record<string, Player>;
  selectedCell: HexCell | null;
  onSelectCell: (cell: HexCell | null) => void;
  climate: ClimateState;
  speciesCatalog: Species[];
}

const HEX_SIZE = 32;
const SVG_PADDING = 40;

function hexCorner(cx: number, cy: number, size: number, i: number): [number, number] {
  const angleDeg = 60 * i;
  const angleRad = (Math.PI / 180) * angleDeg;
  return [cx + size * Math.cos(angleRad), cy + size * Math.sin(angleRad)];
}

function hexPoints(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const [x, y] = hexCorner(cx, cy, size, i);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

function axialToPixel(q: number, r: number, size: number): [number, number] {
  const x = size * (3 / 2) * q;
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return [x, y];
}

function getCellBiomassDensity(cell: HexCell): number {
  const total = cell.populations.reduce((sum, p) => sum + p.biomass, 0);
  return Math.min(total / 100, 1);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default function HexMap({ cells, players, selectedCell, onSelectCell, climate, speciesCatalog }: HexMapProps) {
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(p => (p + 1) % 60);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const cellList = useMemo(() => Object.values(cells), [cells]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of cellList) {
      const [px, py] = axialToPixel(cell.q, cell.r, HEX_SIZE);
      minX = Math.min(minX, px - HEX_SIZE);
      minY = Math.min(minY, py - HEX_SIZE);
      maxX = Math.max(maxX, px + HEX_SIZE);
      maxY = Math.max(maxY, py + HEX_SIZE);
    }
    return { minX, minY, maxX, maxY };
  }, [cellList]);

  const svgWidth = bounds.maxX - bounds.minX + SVG_PADDING * 2;
  const svgHeight = bounds.maxY - bounds.minY + SVG_PADDING * 2;
  const offsetX = -bounds.minX + SVG_PADDING;
  const offsetY = -bounds.minY + SVG_PADDING;

  const warningCells = useMemo(() => {
    const set = new Set<string>();
    for (const ev of climate.warning_events) {
      for (const cell of cellList) {
        if (ev.type === 'Drought' && cell.biome === 'Grassland') set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'Flood' && cell.biome === 'Wetland') set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'Fire' && cell.biome === 'Forest') set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'PestOutbreak') set.add(`${cell.q},${cell.r}`);
      }
    }
    return set;
  }, [climate, cellList]);

  const activeEventCells = useMemo(() => {
    const set = new Set<string>();
    for (const ev of climate.active_events) {
      for (const cell of cellList) {
        if (ev.type === 'Drought' && (cell.biome === 'Grassland' || cell.biome === 'Forest')) set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'Flood' && (cell.biome === 'Wetland' || cell.biome === 'Grassland')) set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'Fire' && cell.biome === 'Forest') set.add(`${cell.q},${cell.r}`);
        if (ev.type === 'PestOutbreak') set.add(`${cell.q},${cell.r}`);
      }
    }
    return set;
  }, [climate, cellList]);

  const pulseOpacity = 0.3 + 0.4 * Math.abs(Math.sin((pulsePhase / 60) * Math.PI * 2));

  const handleClick = (cell: HexCell) => {
    if (selectedCell && selectedCell.q === cell.q && selectedCell.r === cell.r) {
      onSelectCell(null);
    } else {
      onSelectCell(cell);
    }
  };

  return (
    <div style={styles.container}>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="collapseGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {cellList.map(cell => {
          const [px, py] = axialToPixel(cell.q, cell.r, HEX_SIZE);
          const cx = px + offsetX;
          const cy = py + offsetY;
          const biomeColor = BIOME_COLORS[cell.biome];
          const density = getCellBiomassDensity(cell);
          const opacity = 0.35 + density * 0.65;
          const ownerColor = cell.owner_id && players[cell.owner_id] ? players[cell.owner_id].color : 'transparent';
          const isSelected = selectedCell && selectedCell.q === cell.q && selectedCell.r === cell.r;
          const key = `${cell.q},${cell.r}`;
          const isWarning = warningCells.has(key);
          const isActive = activeEventCells.has(key);
          const isCollapsed = cell.collapse_state.is_collapsed;

          return (
            <g key={key} onClick={() => handleClick(cell)} style={{ cursor: 'pointer' }}>
              <polygon
                points={hexPoints(cx, cy, HEX_SIZE - 1)}
                fill={biomeColor}
                fillOpacity={opacity}
                stroke={ownerColor}
                strokeWidth={cell.owner_id ? 2.5 : 0.5}
                strokeOpacity={cell.owner_id ? 0.9 : 0.3}
              />

              {isCollapsed && (
                <polygon
                  points={hexPoints(cx, cy, HEX_SIZE - 1)}
                  fill="#e74c3c"
                  fillOpacity={pulseOpacity}
                  filter="url(#collapseGlow)"
                />
              )}

              {isSelected && (
                <polygon
                  points={hexPoints(cx, cy, HEX_SIZE + 1)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={3}
                  filter="url(#glow)"
                />
              )}

              {cell.habitat_conversion && (
                <polygon
                  points={hexPoints(cx, cy, HEX_SIZE - 4)}
                  fill="none"
                  stroke="#f39c12"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.7}
                />
              )}

              {isWarning && !isActive && (
                <text
                  x={cx}
                  y={cy - HEX_SIZE + 10}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#f39c12"
                  opacity={0.8}
                >
                  ⚠
                </text>
              )}

              {isActive && (() => {
                const activeEvent = climate.active_events[0];
                const icon = activeEvent ? (CLIMATE_ICONS[activeEvent.type] || '⚡') : '⚡';
                return (
                  <text
                    x={cx}
                    y={cy - HEX_SIZE + 10}
                    textAnchor="middle"
                    fontSize="14"
                    filter="url(#glow)"
                  >
                    {icon}
                  </text>
                );
              })()}

              {cell.populations.length > 0 && !isCollapsed && (
                <circle
                  cx={cx + HEX_SIZE - 8}
                  cy={cy - HEX_SIZE + 8}
                  r={3}
                  fill="#2ecc71"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
