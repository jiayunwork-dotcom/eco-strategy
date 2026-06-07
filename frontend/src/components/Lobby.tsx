import React, { useState } from 'react';
import { createGame, joinGame } from '../api';

interface LobbyProps {
  onGameCreated: (gameId: string, playerId: string) => void;
  onGameJoined: (gameId: string, playerId: string) => void;
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
    maxWidth: '900px',
    width: '100%',
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
};

export default function Lobby({ onGameCreated, onGameJoined, error }: LobbyProps) {
  const [createName, setCreateName] = useState('');
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [joinGameId, setJoinGameId] = useState('');
  const [joinName, setJoinName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        </div>
      </div>
      {(localError || error) && <div style={styles.error}>{localError || error}</div>}
    </div>
  );
}
