import React, { useState, useEffect } from 'react';
import { createGame, joinGame, listGames } from '../api';
import { GameListItem } from '../types';

interface LobbyProps {
  onGameCreated: (gameId: string, playerId: string) => void;
  onGameJoined: (gameId: string, playerId: string) => void;
  onWatchReplay: (gameId: string) => void;
  error: string | null;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    background: 'radial-gradient(ellipse at center, #0f2035 0%, #0a1628 70%)',
  },
  panel: {
    display: 'flex',
    gap: '40px',
    padding: '48px',
    maxWidth: '1100px',
    width: '100%',
  },
  leftCol: {
    flex: 1,
    display: 'flex',
    gap: '40px',
  },
  card: {
    flex: 1,
    background: '#0d1b2e',
    border: '1px solid #1a3a5c',
    borderRadius: '12px',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '24px',
    color: '#2ecc71',
    letterSpacing: '0.5px',
  },
  label: {
    fontSize: '13px',
    color: '#8899aa',
    marginBottom: '6px',
    marginTop: '16px',
  },
  input: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#e0e6ed',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
  },
  select: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#e0e6ed',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    appearance: 'none',
    cursor: 'pointer',
  },
  button: {
    marginTop: '24px',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '0.3px',
  },
  createBtn: {
    background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)',
    color: '#0a1628',
  },
  joinBtn: {
    background: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
    color: '#0a1628',
  },
  error: {
    color: '#e74c3c',
    fontSize: '13px',
    marginTop: '12px',
    textAlign: 'center' as const,
  },
  logo: {
    textAlign: 'center' as const,
    marginBottom: '32px',
    width: '100%',
  },
  logoText: {
    fontSize: '36px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #2ecc71 0%, #3498db 50%, #9b59b6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  logoSub: {
    fontSize: '14px',
    color: '#5a7a9a',
    marginTop: '4px',
    letterSpacing: '1px',
  },
  divider: {
    width: '1px',
    background: 'linear-gradient(to bottom, transparent, #1a3a5c, transparent)',
  },
  finishedCard: {
    background: '#0d1b2e',
    border: '1px solid #1a3a5c',
    borderRadius: '12px',
    padding: '32px',
    width: '280px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '500px',
  },
  finishedTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#9b59b6',
    marginBottom: '16px',
    letterSpacing: '0.5px',
  },
  gameList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  gameItem: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  gameItemName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e6ed',
    marginBottom: '4px',
  },
  gameItemMeta: {
    fontSize: '11px',
    color: '#5a7a9a',
    marginBottom: '6px',
  },
  replayBtn: {
    padding: '5px 12px',
    borderRadius: '5px',
    border: 'none',
    background: 'linear-gradient(135deg, #9b59b6, #8e44ad)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  noGames: {
    fontSize: '12px',
    color: '#5a7a9a',
    textAlign: 'center' as const,
    padding: '20px 0',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    marginLeft: '6px',
  },
};

export default function Lobby({ onGameCreated, onGameJoined, onWatchReplay, error }: LobbyProps) {
  const [createName, setCreateName] = useState('');
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [joinGameId, setJoinGameId] = useState('');
  const [joinName, setJoinName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<GameListItem[]>([]);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const list = await listGames();
        setGames(list);
      } catch {}
    };
    fetchGames();
    const interval = setInterval(fetchGames, 10000);
    return () => clearInterval(interval);
  }, []);

  const finishedGames = games.filter(g => g.status === 'Finished');
  const activeGames = games.filter(g => g.status !== 'Finished');

  const handleCreate = async () => {
    if (!createName.trim()) {
      setLocalError('Game name is required');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const { game_id } = await createGame(createName.trim(), createMaxPlayers);
      const { player_id } = await joinGame(game_id, 'Host');
      onGameCreated(game_id, player_id);
    } catch (e: any) {
      setLocalError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinGameId.trim() || !joinName.trim()) {
      setLocalError('Game ID and player name are required');
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const { player_id } = await joinGame(joinGameId.trim(), joinName.trim());
      onGameJoined(joinGameId.trim(), player_id);
    } catch (e: any) {
      setLocalError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' && !loading) action();
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.leftCol}>
          <div style={styles.card}>
            <div style={styles.logo}>
              <div style={styles.logoText}>ECOSTRATEGY</div>
              <div style={styles.logoSub}>Hex-Grid Ecosystem Simulation</div>
            </div>
            <div style={styles.title}>Create Game</div>
            <label style={styles.label}>Game Name</label>
            <input
              style={styles.input}
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleCreate)}
              placeholder="Enter game name..."
              disabled={loading}
            />
            <label style={styles.label}>Max Players</label>
            <select
              style={styles.select}
              value={createMaxPlayers}
              onChange={e => setCreateMaxPlayers(Number(e.target.value))}
              disabled={loading}
            >
              {[4, 5, 6].map(n => (
                <option key={n} value={n}>{n} Players</option>
              ))}
            </select>
            <button
              style={{ ...styles.button, ...styles.createBtn, opacity: loading ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
          </div>

          <div style={styles.divider} />

          <div style={styles.card}>
            <div style={styles.title}>Join Game</div>
            <label style={styles.label}>Game ID</label>
            <input
              style={styles.input}
              value={joinGameId}
              onChange={e => setJoinGameId(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleJoin)}
              placeholder="Paste game ID..."
              disabled={loading}
            />
            <label style={styles.label}>Player Name</label>
            <input
              style={styles.input}
              value={joinName}
              onChange={e => setJoinName(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleJoin)}
              placeholder="Enter your name..."
              disabled={loading}
            />
            <button
              style={{ ...styles.button, ...styles.joinBtn, opacity: loading ? 0.6 : 1 }}
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>

            {activeGames.length > 0 && (
              <>
                <div style={{ ...styles.label, marginTop: '20px', fontSize: '12px', color: '#5a7a9a' }}>
                  Active Games
                </div>
                {activeGames.map(g => (
                  <div key={g.id} style={{ fontSize: '12px', color: '#8899aa', padding: '4px 0' }}>
                    {g.name} ({g.player_count}/{g.max_players}) — Turn {g.current_turn}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {finishedGames.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.finishedCard}>
              <div style={styles.finishedTitle}>🎬 Finished Games</div>
              <div style={styles.gameList}>
                {finishedGames.map(g => (
                  <div key={g.id} style={styles.gameItem}>
                    <div style={styles.gameItemName}>
                      {g.name}
                      <span style={{
                        ...styles.statusBadge,
                        background: '#1a3a5c',
                        color: '#8899aa',
                      }}>
                        {g.player_count} players
                      </span>
                    </div>
                    <div style={styles.gameItemMeta}>
                      Turn {g.current_turn}/{g.max_turns} · {g.player_names.join(', ')}
                    </div>
                    <button
                      style={styles.replayBtn}
                      onClick={() => onWatchReplay(g.id)}
                    >
                      🎥 Watch Replay
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {(localError || error) && <div style={styles.error}>{localError || error}</div>}
    </div>
  );
}
