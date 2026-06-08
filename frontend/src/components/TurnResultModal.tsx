import React from 'react';
import { TurnResult, Player, TROPHIC_COLORS, CLIMATE_ICONS, GENE_NAMES, DriftEvent } from '../types';

interface TurnResultModalProps {
  result: TurnResult;
  onDismiss: () => void;
  players: Record<string, Player>;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#0d1b2e',
    border: '1px solid #1a3a5c',
    borderRadius: '12px',
    padding: '24px',
    width: '520px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid #1a3a5c',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#2ecc71',
  },
  turnNum: {
    fontSize: '14px',
    color: '#8899aa',
  },
  closeBtn: {
    background: 'none',
    border: '1px solid #1a3a5c',
    borderRadius: '6px',
    color: '#8899aa',
    cursor: 'pointer',
    padding: '4px 12px',
    fontSize: '12px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#e0e6ed',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  item: {
    padding: '6px 10px',
    background: '#0a1628',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '12px',
    color: '#8899aa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  changePositive: {
    color: '#2ecc71',
    fontWeight: 600,
  },
  changeNegative: {
    color: '#e74c3c',
    fontWeight: 600,
  },
  collapseItem: {
    padding: '6px 10px',
    background: 'rgba(231, 76, 60, 0.1)',
    border: '1px solid rgba(231, 76, 60, 0.2)',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '12px',
    color: '#e74c3c',
  },
  climateItem: {
    padding: '6px 10px',
    background: 'rgba(243, 156, 18, 0.1)',
    border: '1px solid rgba(243, 156, 18, 0.2)',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '12px',
    color: '#f39c12',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  territoryItem: {
    padding: '6px 10px',
    background: '#0a1628',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  emptySection: {
    fontSize: '12px',
    color: '#5a7a9a',
    fontStyle: 'italic',
    padding: '4px 10px',
  },
};

export default function TurnResultModal({ result, onDismiss, players }: TurnResultModalProps) {
  const hasPopChanges = result.population_changes.length > 0;
  const hasCollapses = result.collapse_events.length > 0;
  const hasClimate = result.climate_events.length > 0;
  const hasTerritory = result.territory_changes.length > 0;

  const getPlayerName = (id: string | null) => {
    if (!id) return 'Neutral';
    return players[id]?.name || 'Unknown';
  };

  const getPlayerColor = (id: string | null) => {
    if (!id) return '#5a7a9a';
    return players[id]?.color || '#5a7a9a';
  };

  return (
    <div style={styles.overlay} onClick={onDismiss}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Turn Results</div>
            <div style={styles.turnNum}>Turn {result.turn}</div>
          </div>
          <button style={styles.closeBtn} onClick={onDismiss}>Close ✕</button>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>📊 Population Changes</div>
          {hasPopChanges ? (
            result.population_changes.slice(0, 20).map((change, i) => {
              const diff = change.new_count - change.old_count;
              const pct = change.old_count > 0 ? ((diff / change.old_count) * 100).toFixed(1) : 'N/A';
              return (
                <div key={i} style={styles.item}>
                  <span>Cell ({change.cell[0]},{change.cell[1]}) · Species {change.species_id.slice(0, 8)}...</span>
                  <span style={diff >= 0 ? styles.changePositive : styles.changeNegative}>
                    {diff >= 0 ? '+' : ''}{Math.round(diff)} ({diff >= 0 ? '+' : ''}{pct}%)
                  </span>
                </div>
              );
            })
          ) : (
            <div style={styles.emptySection}>No population changes this turn</div>
          )}
          {result.population_changes.length > 20 && (
            <div style={{ ...styles.emptySection, fontStyle: 'normal', color: '#8899aa' }}>
              +{result.population_changes.length - 20} more changes...
            </div>
          )}
        </div>

        {hasCollapses && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>⚠️ Ecosystem Collapses</div>
            {result.collapse_events.map((evt, i) => (
              <div key={i} style={styles.collapseItem}>
                <div>Cell ({evt.cell[0]},{evt.cell[1]}): {evt.cause}</div>
                {evt.spread_to.length > 0 && (
                  <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.8 }}>
                    Spread to: {evt.spread_to.map(c => `(${c[0]},${c[1]})`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasClimate && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>🌪️ Climate Events</div>
            {result.climate_events.map((evt, i) => (
              <div key={i} style={styles.climateItem}>
                <span>{CLIMATE_ICONS[evt.type] || '⚡'}</span>
                <span>{evt.type}{evt.target_trophic ? ` (targeting ${evt.target_trophic})` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {hasTerritory && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>🗺️ Territory Changes</div>
            {result.territory_changes.map((change, i) => (
              <div key={i} style={styles.territoryItem}>
                <span>Cell ({change.cell[0]},{change.cell[1]}):</span>
                <span style={{ color: getPlayerColor(change.old_owner) }}>
                  {getPlayerName(change.old_owner)}
                </span>
                <span>→</span>
                <span style={{ color: getPlayerColor(change.new_owner) }}>
                  {getPlayerName(change.new_owner)}
                </span>
              </div>
            ))}
          </div>
        )}

        {result.mutation_events && result.mutation_events.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>🧬 Mutations</div>
            {result.mutation_events.map((evt, i) => (
              <div key={i} style={{
                ...styles.item,
                background: evt.is_artificial ? 'rgba(243, 156, 18, 0.1)' : 'rgba(155, 89, 182, 0.1)',
                borderLeft: `3px solid ${evt.is_artificial ? '#f39c12' : '#9b59b6'}`,
              }}>
                <span>
                  {evt.is_artificial ? '⚒' : '🧬'} {evt.child_name}
                  <span style={{ fontSize: '10px', color: '#5a7a9a', marginLeft: '6px' }}>
                    ({GENE_NAMES[evt.mutated_genes[0]]}{evt.mutated_genes.length > 1 ? ` +${evt.mutated_genes.length - 1}` : ''})
                  </span>
                </span>
                <span style={{ fontSize: '10px', color: '#5a7a9a' }}>
                  Cell ({evt.cell[0]},{evt.cell[1]})
                </span>
              </div>
            ))}
          </div>
        )}

        {result.drift_events && result.drift_events.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>🔬 Genetic Drift</div>
            {result.drift_events.map((evt: DriftEvent, i: number) => (
              <div key={i} style={{
                ...styles.item,
                background: 'rgba(52, 152, 219, 0.1)',
                borderLeft: '3px solid #3498db',
              }}>
                <span>
                  🔬 {evt.species_name}
                  <span style={{ fontSize: '10px', color: '#5a7a9a', marginLeft: '6px' }}>
                    ({evt.drifted_genes.map(g => GENE_NAMES[g]).join(', ')})
                  </span>
                </span>
                <span style={{ fontSize: '10px', color: '#5a7a9a' }}>
                  Cell ({evt.cell[0]},{evt.cell[1]}) · Pop {Math.round(evt.population_count)}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
            color: '#0a1628',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: '8px',
          }}
          onClick={onDismiss}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
