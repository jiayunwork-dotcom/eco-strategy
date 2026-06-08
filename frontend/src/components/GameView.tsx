import React, { useState, useRef, MutableRefObject } from 'react';
import { GameState, TurnResult, PopulationHistoryEntry, HexCell, MutationHistoryEntry } from '../types';
import { WebSocketManager } from '../api';
import PlayerBar from './PlayerBar';
import HexMap from './HexMap';
import SpeciesPanel from './SpeciesPanel';
import ActionPanel from './ActionPanel';
import ClimateAlert from './ClimateAlert';
import TurnResultModal from './TurnResultModal';
import FoodWebGraph from './FoodWebGraph';
import EvolutionPanel from './EvolutionPanel';

interface GameViewProps {
  gameState: GameState;
  playerId: string;
  turnResult: TurnResult | null;
  populationHistory: Record<string, PopulationHistoryEntry[]>;
  mutationHistory: MutationHistoryEntry[];
  onDismissResult: () => void;
  wsRef: MutableRefObject<WebSocketManager | null>;
  onRefresh: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  mapArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    width: '340px',
    background: '#0d1b2e',
    borderLeft: '1px solid #1a3a5c',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  bottomPanel: {
    background: '#0d1b2e',
    borderTop: '1px solid #1a3a5c',
  },
  turnInfo: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    background: 'rgba(10, 22, 40, 0.9)',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#8899aa',
    zIndex: 10,
    backdropFilter: 'blur(4px)',
  },
  turnNum: {
    color: '#2ecc71',
    fontWeight: 700,
    fontSize: '15px',
  },
  gameName: {
    color: '#e0e6ed',
    fontWeight: 600,
  },
  advanceBtn: {
    marginTop: '8px',
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    color: '#0a1628',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    letterSpacing: '0.3px',
  },
  status: {
    position: 'absolute',
    top: '12px',
    right: '352px',
    background: 'rgba(10, 22, 40, 0.9)',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    color: '#8899aa',
    zIndex: 10,
  },
  tabContainer: {
    display: 'flex',
    borderBottom: '1px solid #1a3a5c',
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    textAlign: 'center' as const,
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#5a7a9a',
    transition: 'all 0.15s',
  },
  tabActive: {
    color: '#2ecc71',
    borderBottomColor: '#2ecc71',
  },
};

export default function GameView({
  gameState,
  playerId,
  turnResult,
  populationHistory,
  mutationHistory,
  onDismissResult,
  wsRef,
  onRefresh,
}: GameViewProps) {
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'species' | 'evolution'>('species');

  const currentPlayer = gameState.players[playerId];
  const isRunning = gameState.status === 'Running';
  const isFinished = gameState.status === 'Finished';

  const handleAdvanceTurn = () => {
    if (wsRef.current) {
      wsRef.current.sendAdvanceTurn();
    }
  };

  return (
    <div style={styles.container}>
      <PlayerBar gameState={gameState} currentPlayerId={playerId} />

      <div style={styles.main}>
        <div style={styles.mapArea}>
          <HexMap
            cells={gameState.cells}
            players={gameState.players}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            climate={gameState.climate}
            speciesCatalog={gameState.species_catalog}
          />

          <div style={styles.turnInfo}>
            <span style={styles.gameName}>{gameState.name}</span>
            <span style={{ margin: '0 8px' }}>·</span>
            Turn <span style={styles.turnNum}>{gameState.current_turn}</span>
            <span style={{ margin: '0 4px' }}>/ {gameState.max_turns}</span>
            {currentPlayer && (
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                Resources: <span style={{ color: '#f39c12', fontWeight: 600 }}>{currentPlayer.resource_points}</span>
                {' · '}Actions: <span style={{ color: '#3498db', fontWeight: 600 }}>{currentPlayer.actions_remaining.IntroduceSpecies + currentPlayer.actions_remaining.HuntingQuota + currentPlayer.actions_remaining.SpeciesProtection + currentPlayer.actions_remaining.BioInvasion + currentPlayer.actions_remaining.HabitatConversion + (currentPlayer.actions_remaining.DirectedBreeding || 0)}</span>
              </div>
            )}
            {isRunning && currentPlayer?.is_alive && (
              <button style={styles.advanceBtn} onClick={handleAdvanceTurn}>
                ⏩ Advance Turn
              </button>
            )}
          </div>

          <div style={styles.status}>
            {isFinished ? '🏁 Game Over' : isRunning ? '🟢 In Progress' : '⏳ Waiting for Players'}
          </div>

          <ClimateAlert climate={gameState.climate} currentTurn={gameState.current_turn} />
        </div>

        <div style={styles.sidebar}>
          <div style={styles.tabContainer}>
            <button
              style={{ ...styles.tab, ...(sidebarTab === 'species' ? styles.tabActive : {}) }}
              onClick={() => setSidebarTab('species')}
            >
              Species
            </button>
            <button
              style={{ ...styles.tab, ...(sidebarTab === 'evolution' ? styles.tabActive : {}) }}
              onClick={() => setSidebarTab('evolution')}
            >
              Evolution
            </button>
          </div>
          {sidebarTab === 'species' ? (
            <>
              <SpeciesPanel
                cell={selectedCell}
                speciesCatalog={gameState.species_catalog}
                players={gameState.players}
                populationHistory={populationHistory}
              />
              {selectedCell && (
                <FoodWebGraph
                  speciesCatalog={gameState.species_catalog}
                  populations={selectedCell.populations}
                  predationMatrix={gameState.predation_matrix}
                />
              )}
            </>
          ) : (
            <EvolutionPanel gameState={gameState} mutationHistory={mutationHistory} />
          )}
        </div>
      </div>

      <div style={styles.bottomPanel}>
        <ActionPanel
          gameState={gameState}
          playerId={playerId}
          selectedCell={selectedCell}
          wsRef={wsRef}
          onRefresh={onRefresh}
        />
      </div>

      {turnResult && (
        <TurnResultModal result={turnResult} onDismiss={onDismissResult} players={gameState.players} />
      )}
    </div>
  );
}
