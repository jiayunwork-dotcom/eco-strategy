import { GameState, PlayerAction, TurnResult, ReplayData, GameListItem } from './types';

const API_BASE = '';

export async function createGame(name: string, maxPlayers: number): Promise<{ game_id: string }> {
  const res = await fetch(`${API_BASE}/api/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, max_players: maxPlayers }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create game');
  return res.json();
}

export async function listGames(): Promise<GameListItem[]> {
  const res = await fetch(`${API_BASE}/api/games`);
  if (!res.ok) throw new Error('Failed to list games');
  return res.json();
}

export async function joinGame(gameId: string, playerName: string): Promise<{ player_id: string }> {
  const res = await fetch(`${API_BASE}/api/games/${gameId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to join game');
  return res.json();
}

export async function getGameState(gameId: string): Promise<GameState> {
  const res = await fetch(`${API_BASE}/api/games/${gameId}`);
  if (!res.ok) throw new Error('Failed to fetch game state');
  return res.json();
}

export async function getReplay(gameId: string): Promise<ReplayData> {
  const res = await fetch(`${API_BASE}/api/games/${gameId}/replay`);
  if (!res.ok) throw new Error('Failed to fetch replay data');
  return res.json();
}

export async function submitAction(gameId: string, playerId: string, action: PlayerAction): Promise<void> {
  const res = await fetch(`${API_BASE}/api/games/${gameId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: playerId, action }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Action failed');
}

export async function advanceTurn(gameId: string): Promise<TurnResult> {
  const res = await fetch(`${API_BASE}/api/games/${gameId}/turn`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to advance turn');
  return res.json();
}

export type WsMessageHandler = (data: any) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private gameId: string;
  private onMessage: WsMessageHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private shouldReconnect = true;

  constructor(gameId: string, onMessage: WsMessageHandler) {
    this.gameId = gameId;
    this.onMessage = onMessage;
  }

  connect(): void {
    this.shouldReconnect = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/${this.gameId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch {
        this.onMessage(event.data);
      }
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  sendJoin(playerId: string): void {
    this.send({ type: 'join', player_id: playerId });
  }

  sendAction(action: PlayerAction): void {
    this.send({ type: 'action', action });
  }

  sendAdvanceTurn(): void {
    this.send({ type: 'advance_turn' });
  }

  private send(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
