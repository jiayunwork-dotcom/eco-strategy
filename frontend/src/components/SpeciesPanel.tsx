import React from 'react';
import { HexCell, Species, Player, PopulationHistoryEntry, TROPHIC_COLORS, TROPHIC_ICONS } from '../types';

interface SpeciesPanelProps {
  cell: HexCell | null;
  speciesCatalog: Species[];
  players: Record<string, Player>;
  populationHistory: Record<string, PopulationHistoryEntry[]>;
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#2ecc71',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #1a3a5c',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: '#5a7a9a',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  cellInfo: {
    background: '#0a1628',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
  },
  cellInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#8899aa',
    marginBottom: '4px',
  },
  cellInfoValue: {
    color: '#e0e6ed',
    fontWeight: 600,
  },
  speciesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  speciesCard: {
    background: '#0a1628',
    borderRadius: '8px',
    padding: '10px 12px',
    borderLeft: '3px solid',
  },
  speciesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  speciesName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e6ed',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  speciesCount: {
    fontSize: '11px',
    color: '#8899aa',
  },
  barContainer: {
    height: '6px',
    background: '#152238',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  bar: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s',
  },
  sparklineContainer: {
    height: '20px',
    marginTop: '4px',
  },
  tags: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
  },
  tag: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 600,
  },
  tagProtected: {
    background: 'rgba(46, 204, 113, 0.15)',
    color: '#2ecc71',
  },
  tagHunting: {
    background: 'rgba(243, 156, 18, 0.15)',
    color: '#f39c12',
  },
  collapseBanner: {
    background: 'rgba(231, 76, 60, 0.15)',
    border: '1px solid rgba(231, 76, 60, 0.3)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '12px',
    color: '#e74c3c',
    fontSize: '12px',
    fontWeight: 600,
  },
  collapseDetail: {
    color: '#8899aa',
    fontWeight: 400,
    fontSize: '11px',
    marginTop: '4px',
  },
  ownerTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 600,
  },
};

function Sparkline({ data, color }: { data: PopulationHistoryEntry[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 80;
  const h = 18;
  const step = w / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = h - (d.count / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SpeciesPanel({ cell, speciesCatalog, players, populationHistory }: SpeciesPanelProps) {
  if (!cell) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Cell Details</div>
        <div style={styles.empty}>Select a hex cell to view species and ecosystem details</div>
      </div>
    );
  }

  const speciesMap = new Map(speciesCatalog.map(s => [s.id, s]));
  const owner = cell.owner_id ? players[cell.owner_id] : null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        Cell ({cell.q}, {cell.r}) · {cell.biome}
      </div>

      {cell.collapse_state.is_collapsed && (
        <div style={styles.collapseBanner}>
          ⚠ ECOSYSTEM COLLAPSED
          <div style={styles.collapseDetail}>
            Turns collapsed: {cell.collapse_state.turns_collapsed}
            {cell.collapse_state.missing_trophic_levels.length > 0 && (
              <> · Missing: {cell.collapse_state.missing_trophic_levels.join(', ')}</>
            )}
            {cell.collapse_state.nutrient_overflow > 0 && (
              <> · Nutrient overflow: {cell.collapse_state.nutrient_overflow.toFixed(1)}</>
            )}
          </div>
        </div>
      )}

      <div style={styles.cellInfo}>
        <div style={styles.cellInfoRow}>
          <span>Temperature</span>
          <span style={styles.cellInfoValue}>{cell.temperature.toFixed(1)}°C</span>
        </div>
        <div style={styles.cellInfoRow}>
          <span>Humidity</span>
          <span style={styles.cellInfoValue}>{cell.humidity.toFixed(1)}%</span>
        </div>
        <div style={styles.cellInfoRow}>
          <span>Altitude</span>
          <span style={styles.cellInfoValue}>{cell.altitude.toFixed(1)}m</span>
        </div>
        <div style={styles.cellInfoRow}>
          <span>Owner</span>
          {owner ? (
            <span style={{ ...styles.ownerTag, background: `${owner.color}22`, color: owner.color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: owner.color, display: 'inline-block' }} />
              {owner.name}
            </span>
          ) : (
            <span style={styles.cellInfoValue}>Unclaimed</span>
          )}
        </div>
        <div style={styles.cellInfoRow}>
          <span>Stable Turns</span>
          <span style={styles.cellInfoValue}>{cell.stable_turns}</span>
        </div>
        {cell.habitat_conversion && (
          <div style={styles.cellInfoRow}>
            <span>Converting to</span>
            <span style={{ ...styles.cellInfoValue, color: '#f39c12' }}>
              {cell.habitat_conversion.target_biome} ({cell.habitat_conversion.turns_remaining} turns)
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#5a7a9a', marginBottom: '8px', fontWeight: 600 }}>
        Populations ({cell.populations.length})
      </div>

      <div style={styles.speciesList}>
        {cell.populations.map(pop => {
          const species = speciesMap.get(pop.species_id);
          if (!species) return null;
          const trophicColor = TROPHIC_COLORS[species.trophic_level];
          const icon = TROPHIC_ICONS[species.trophic_level];
          const popPercent = Math.min((pop.count / species.max_population) * 100, 100);
          const historyKey = `${cell.q},${cell.r}:${pop.species_id}`;
          const history = populationHistory[historyKey] || [];

          return (
            <div key={pop.species_id} style={{ ...styles.speciesCard, borderLeftColor: trophicColor }}>
              <div style={styles.speciesHeader}>
                <span style={styles.speciesName}>
                  <span>{icon}</span>
                  {species.name}
                </span>
                <span style={styles.speciesCount}>
                  {Math.round(pop.count)} / {species.max_population}
                </span>
              </div>
              <div style={styles.barContainer}>
                <div style={{ ...styles.bar, width: `${popPercent}%`, background: trophicColor }} />
              </div>
              <div style={styles.sparklineContainer}>
                <Sparkline data={history} color={trophicColor} />
              </div>
              <div style={styles.tags}>
                {pop.protected && (
                  <span style={{ ...styles.tag, ...styles.tagProtected }}>🛡 Protected</span>
                )}
                {pop.hunting_quota > 0 && (
                  <span style={{ ...styles.tag, ...styles.tagHunting }}>🎯 Quota: {pop.hunting_quota}</span>
                )}
                {species.is_artificial && (
                  <span style={{ ...styles.tag, background: 'rgba(243, 156, 18, 0.15)', color: '#f39c12' }}>&#x2692; Bred</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {cell.populations.length === 0 && (
        <div style={{ ...styles.empty, height: 'auto', padding: '20px' }}>
          No populations in this cell
        </div>
      )}
    </div>
  );
}
