import React from 'react';
import { GameState, Player } from '../types';

interface PlayerBarProps {
  gameState: GameState;
  currentPlayerId: string;
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#0d1b2e',
    borderBottom: '1px solid #1a3a5c',
    gap: '8px',
    overflowX: 'auto',
    minHeight: '56px',
  },
  playerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: '8px',
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    minWidth: '0',
    flexShrink: 0,
  },
  activeCard: {
    borderColor: '#2ecc71',
    boxShadow: '0 0 8px rgba(46, 204, 113, 0.2)',
  },
  deadCard: {
    opacity: 0.4,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e6ed',
    whiteSpace: 'nowrap' as const,
  },
  stats: {
    display: 'flex',
    gap: '10px',
    fontSize: '11px',
    color: '#8899aa',
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
  },
  statValue: {
    fontWeight: 700,
  },
  resourceColor: {
    color: '#f39c12',
  },
  territoryColor: {
    color: '#3498db',
  },
  diversityColor: {
    color: '#2ecc71',
  },
  deadBadge: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    background: 'rgba(231, 76, 60, 0.2)',
    color: '#e74c3c',
    fontWeight: 700,
  },
  separator: {
    width: '1px',
    height: '24px',
    background: '#1a3a5c',
    flexShrink: 0,
  },
};

function getTerritoryCount(gameState: GameState, playerId: string): number {
  let count = 0;
  for (const cell of Object.values(gameState.cells)) {
    if (cell.owner_id === playerId) count++;
  }
  return count;
}

function getDiversityScore(gameState: GameState, playerId: string): number {
  const speciesSet = new Set<string>();
  for (const cell of Object.values(gameState.cells)) {
    if (cell.owner_id === playerId) {
      for (const pop of cell.populations) {
        speciesSet.add(pop.species_id);
      }
    }
  }
  return speciesSet.size;
}

export default function PlayerBar({ gameState, currentPlayerId }: PlayerBarProps) {
  const playerList = Object.values(gameState.players);

  return (
    <div style={styles.bar}>
      {playerList.map((player, idx) => {
        const isCurrent = player.id === currentPlayerId;
        const territory = getTerritoryCount(gameState, player.id);
        const diversity = getDiversityScore(gameState, player.id);

        return (
          <React.Fragment key={player.id}>
            {idx > 0 && <div style={styles.separator} />}
            <div style={{
              ...styles.playerCard,
              ...(isCurrent ? styles.activeCard : {}),
              ...(!player.is_alive ? styles.deadCard : {}),
            }}>
              <div style={{ ...styles.colorDot, background: player.color }} />
              <span style={styles.name}>{player.name}</span>
              {!player.is_alive && <span style={styles.deadBadge}>ELIMINATED</span>}
              <div style={styles.stats}>
                <span style={styles.stat}>
                  💰 <span style={{ ...styles.statValue, ...styles.resourceColor }}>{player.resource_points}</span>
                </span>
                <span style={styles.stat}>
                  🏠 <span style={{ ...styles.statValue, ...styles.territoryColor }}>{territory}</span>
                </span>
                <span style={styles.stat}>
                  🧬 <span style={{ ...styles.statValue, ...styles.diversityColor }}>{diversity}</span>
                </span>
                {player.stable_turns_count > 0 && (
                  <span style={styles.stat}>
                    ⏳ <span style={styles.statValue}>{player.stable_turns_count}</span>
                  </span>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
