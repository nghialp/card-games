import { create } from 'zustand';
import { sameTile, type Tile } from '@card-games/game-tusac';
import type {
  TuSacMatchState,
  TuSacResponse,
  TuSacResult,
  TuSacRoomState,
} from '@card-games/types';
import { errorLabel } from '../lib/api';
import { emitAck, getSocket, getUserId } from '../lib/socket';
import { sounds } from '../lib/sound';
import { useAuth } from './auth';

interface TuSacStore {
  room: TuSacRoomState | null;
  rooms: TuSacRoomState[];
  hand: Tile[];
  match: TuSacMatchState | null;
  result: TuSacResult | null;
  /** Lá đang chọn để đánh */
  selected: Tile | null;
  error: string | null;

  /** Gắn handler socket (gọi sau khi socket đã connect) */
  wire: () => void;
  list: () => Promise<void>;
  create: (betAmount: number) => Promise<void>;
  join: (roomId: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  leave: () => Promise<void>;
  draw: () => Promise<void>;
  select: (tile: Tile) => void;
  discardSelected: () => Promise<void>;
  respond: (response: TuSacResponse) => Promise<void>;
  declareWin: () => Promise<void>;
  dismissResult: () => void;
  clearError: () => void;
}

/** Socket đã gắn handler tusac — tránh đăng ký trùng */
let wiredSocket: unknown = null;

export const useTusac = create<TuSacStore>((set, get) => {
  const guard = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      set({ error: errorLabel(err) });
    }
  };

  return {
    room: null,
    rooms: [],
    hand: [],
    match: null,
    result: null,
    selected: null,
    error: null,

    wire() {
      const socket = getSocket();
      if (wiredSocket === socket) return;
      wiredSocket = socket;

      socket.on('tusac:room', (room) => {
        // chỉ nhận state phòng có mình (socket có thể còn subscribe phòng cũ)
        if (!room.players.some((p) => p.userId === getUserId())) return;
        set({ room });
        if (room.status === 'waiting') set({ match: null, hand: [], selected: null });
      });

      socket.on('tusac:hand', ({ tiles }) => {
        set({ hand: sortTiles(tiles as Tile[]), selected: null, result: null });
      });

      socket.on('tusac:state', (match) => {
        const prev = get().match;
        // âm thanh nhẹ khi có lá mới xuất hiện / tới lượt mình
        if (match.pending && match.pending !== prev?.pending) sounds.play();
        set({ match });
      });

      socket.on('tusac:ended', (result) => {
        if (result.kind === 'win') {
          const mySeat = seatOf(get().room);
          if (result.winner === mySeat) sounds.win();
          else sounds.lose();
        }
        const delta = result.coinDelta[getUserId()];
        if (delta !== undefined) useAuth.getState().applyDelta(delta);
        set({ result });
      });
    },

    list: () =>
      guard(async () => {
        const rooms = await emitAck<TuSacRoomState[]>('tusac:list', {});
        set({ rooms });
      }),

    create: (betAmount) =>
      guard(async () => {
        const room = await emitAck<TuSacRoomState>('tusac:create', { betAmount });
        set({ room, result: null });
      }),

    join: (roomId) =>
      guard(async () => {
        const room = await emitAck<TuSacRoomState>('tusac:join', { roomId });
        set({ room, result: null });
      }),

    setReady: (ready) =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('tusac:ready', { roomId, ready });
      }),

    leave: () =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('tusac:leave', { roomId });
        set({ room: null, match: null, hand: [], result: null, selected: null });
      }),

    draw: () =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('tusac:draw', { roomId });
      }),

    select(tile) {
      set((s) => ({
        selected: s.selected && sameTile(s.selected, tile) ? null : tile,
      }));
    },

    discardSelected: () =>
      guard(async () => {
        const { room, selected } = get();
        if (!room || !selected) return;
        await emitAck('tusac:discard', { roomId: room.id, tile: selected });
        set({ selected: null });
      }),

    respond: (response) =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('tusac:respond', { roomId, response });
      }),

    declareWin: () =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('tusac:win', { roomId });
      }),

    dismissResult: () => set({ result: null }),
    clearError: () => set({ error: null }),
  };
});

export function seatOf(room: TuSacRoomState | null): number {
  return room?.players.find((p) => p.userId === getUserId())?.seat ?? -1;
}

const sortTiles = (tiles: Tile[]): Tile[] =>
  [...tiles].sort((a, b) => a.piece - b.piece || a.color - b.color);
