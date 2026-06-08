import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, TurnResult, PopulationHistoryEntry, ReplayData, MutationHistoryEntry } from './types';
import { getGameState, getReplay, WebSocketManager } from './api';
import Lobby from './components/Lobby';
import GameView from './components/GameView';
import Replay from './components/Replay';

type ViewMode = 'lobby' | 'game' | 'replay';

const styles: Record<string, React.CSSProperties> = {
  app: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a1628',
    color: '#e0e6ed',
    overflow: 'hidden',
  },
};

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('lobby');
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [populationHistory, setPopulationHistory] = useState<Record<string, PopulationHistoryEntry[]>>({});
  const [mutationHistory, setMutationHistory] = useState<MutationHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const wsRef = useRef<WebSocketManager | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    if (!gameId) return;
    try {
      const state = await getGameState(gameId);
      setGameState(state);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [gameId]);

  useEffect(() => {
    if (viewMode !== 'game' || !gameId) return;
    fetchState();
    pollRef.current = setInterval(fetchState, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameId, viewMode, fetchState]);

  useEffect(() => {
    if (viewMode !== 'game' || !gameId) return;
    const ws = new WebSocketManager(gameId, (data) => {
      if (data.turn !== undefined) {
        setTurnResult(data);
        updatePopulationHistory(data);
      }
      fetchState();
    });
    ws.connect();
    if (playerId) {
      ws.sendJoin(playerId);
    }
    wsRef.current = ws;
    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [gameId, playerId, viewMode, fetchState]);

  const updatePopulationHistory = useCallback((result: TurnResult) => {
    setPopulationHistory(prev => {
      const next = { ...prev };
      for (const change of result.population_changes) {
        const key = `${change.cell[0]},${change.cell[1]}:${change.species_id}`;
        const history = next[key] || [];
        next[key] = [...history.slice(-4), { turn: result.turn, count: change.new_count }];
      }
      return next;
    });
    if (result.mutation_events && result.mutation_events.length > 0) {
      setMutationHistory(prev => [
        ...prev,
        ...result.mutation_events.map(evt => ({
          turn: result.turn,
          parent_species_id: evt.parent_species_id,
          child_species_id: evt.child_species_id,
          child_name: evt.child_name,
          mutated_genes: evt.mutated_genes,
          is_artificial: evt.is_artificial,
        })),
      ]);
    }
  }, []);

  const handleGameCreated = (gid: string, pid: string) => {
    setGameId(gid);
    setPlayerId(pid);
    setViewMode('game');
  };

  const handleGameJoined = (gid: string, pid: string) => {
    setGameId(gid);
    setPlayerId(pid);
    setViewMode('game');
  };

  const handleDismissResult = () => {
    setTurnResult(null);
  };

  const handleWatchReplay = async (gid: string) => {
    setReplayLoading(true);
    setError(null);
    try {
      const data = await getReplay(gid);
      setReplayData(data);
      setGameId(gid);
      setViewMode('replay');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReplayLoading(false);
    }
  };

  const handleBackFromReplay = () => {
    setReplayData(null);
    setGameId(null);
    setPlayerId(null);
    setGameState(null);
    setMutationHistory([]);
    setViewMode('lobby');
  };

  if (viewMode === 'replay' && replayData) {
    return (
      <div style={styles.app}>
        <Replay replayData={replayData} onBack={handleBackFromReplay} />
      </div>
    );
  }

  if (viewMode === 'game' && gameId && playerId && gameState) {
    return (
      <div style={styles.app}>
        <GameView
          gameState={gameState}
          playerId={playerId}
          turnResult={turnResult}
          populationHistory={populationHistory}
          mutationHistory={mutationHistory}
          onDismissResult={handleDismissResult}
          wsRef={wsRef}
          onRefresh={fetchState}
        />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <Lobby
        onGameCreated={handleGameCreated}
        onGameJoined={handleGameJoined}
        onWatchReplay={handleWatchReplay}
        error={error}
      />
      {replayLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 22, 40, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ color: '#2ecc71', fontSize: '16px', fontWeight: 600 }}>
            Loading replay data...
          </div>
        </div>
      )}
    </div>
  );
}
