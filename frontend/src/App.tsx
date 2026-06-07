import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, TurnResult, PopulationHistoryEntry } from './types';
import { getGameState, WebSocketManager } from './api';
import Lobby from './components/Lobby';
import GameView from './components/GameView';

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
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [turnResult, setTurnResult] = useState<TurnResult | null>(null);
  const [populationHistory, setPopulationHistory] = useState<Record<string, PopulationHistoryEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
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
    if (!gameId) return;
    fetchState();
    pollRef.current = setInterval(fetchState, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameId, fetchState]);

  useEffect(() => {
    if (!gameId) return;
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
  }, [gameId, playerId, fetchState]);

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
  }, []);

  const handleGameCreated = (gid: string, pid: string) => {
    setGameId(gid);
    setPlayerId(pid);
  };

  const handleGameJoined = (gid: string, pid: string) => {
    setGameId(gid);
    setPlayerId(pid);
  };

  const handleDismissResult = () => {
    setTurnResult(null);
  };

  if (!gameId || !playerId || !gameState) {
    return (
      <div style={styles.app}>
        <Lobby onGameCreated={handleGameCreated} onGameJoined={handleGameJoined} error={error} />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <GameView
        gameState={gameState}
        playerId={playerId}
        turnResult={turnResult}
        populationHistory={populationHistory}
        onDismissResult={handleDismissResult}
        wsRef={wsRef}
        onRefresh={fetchState}
      />
    </div>
  );
}
