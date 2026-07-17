import { create } from 'zustand';
import {
  cardValue,
  detectCombo,
  sortCards,
  validatePlay,
  type Combo,
} from '@card-games/game-tienlen';
import type { Card, ChatMessage, MatchResult, RoomState } from '@card-games/types';
import { errorLabel } from '../lib/api';
import {
  connectSocket,
  emitAck,
  getUserId,
  type SocketSession,
} from '../lib/socket';
import { initAudio, sounds } from '../lib/sound';
import { useAuth } from './auth';

interface GameStore {
  displayName: string;
  connected: boolean;
  room: RoomState | null;
  hand: Card[];
  selected: Card[];
  /** Combo đang trên bàn (null = lượt mở vòng) */
  table: Combo | null;
  currentSeat: number;
  turnEndsAt: number;
  passedSeats: number[];
  cardsLeft: Record<number, number>;
  /** Bài mỗi ghế vừa đánh trong vòng hiện tại — xoá khi sang vòng mới */
  playedBySeat: Record<number, Card[]>;
  lastPlayedSeat: number;
  result: MatchResult | null;
  chat: ChatMessage[];
  error: string | null;

  connect: (displayName: string, session?: SocketSession) => void;
  quickJoin: (betAmount: number) => Promise<void>;
  leave: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  toggleSelect: (card: Card) => void;
  playSelected: () => Promise<void>;
  pass: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  dismissResult: () => void;
  clearError: () => void;
}

const sameCard = (a: Card, b: Card): boolean =>
  a.rank === b.rank && a.suit === b.suit;

let seq = 0;
/** Socket đã gắn handler — tránh đăng ký trùng khi connect() gọi lại */
let wiredSocket: unknown = null;

export const useGame = create<GameStore>((set, get) => {
  const guard = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      set({ error: errorLabel(err) });
    }
  };

  return {
    displayName: localStorage.getItem('cg:displayName') ?? '',
    connected: false,
    room: null,
    hand: [],
    selected: [],
    table: null,
    currentSeat: -1,
    turnEndsAt: 0,
    passedSeats: [],
    cardsLeft: {},
    playedBySeat: {},
    lastPlayedSeat: -1,
    result: null,
    chat: [],
    error: null,

    connect(displayName, session) {
      localStorage.setItem('cg:displayName', displayName);
      initAudio();
      const socket = connectSocket(displayName, session);
      set({ displayName });
      if (wiredSocket === socket) return;
      wiredSocket = socket;

      socket.on('connect', () => set({ connected: true }));
      socket.on('disconnect', () => set({ connected: false }));

      socket.on('room:state', (room) => {
        // socket có thể còn subscribe phòng cũ — chỉ nhận state phòng có mình
        if (!room.players.some((p) => p.userId === getUserId())) return;
        const cardsLeft: Record<number, number> = {};
        for (const p of room.players) {
          if (p.cardsLeft !== undefined) cardsLeft[p.seat] = p.cardsLeft;
        }
        set({ room, cardsLeft });
        if (room.status === 'waiting') {
          set({
            table: null,
            currentSeat: -1,
            passedSeats: [],
            hand: [],
            playedBySeat: {},
            lastPlayedSeat: -1,
          });
        }
      });

      socket.on('game:hand', ({ cards }) =>
        set({
          hand: sortCards(cards),
          selected: [],
          result: null,
          playedBySeat: {},
          lastPlayedSeat: -1,
        }),
      );

      socket.on('game:played', ({ seat, cards, cardsLeft }) => {
        sounds.play();
        set((s) => ({
          table: detectCombo(cards),
          cardsLeft: { ...s.cardsLeft, [seat]: cardsLeft },
          passedSeats: [],
          playedBySeat: { ...s.playedBySeat, [seat]: cards },
          lastPlayedSeat: seat,
          hand:
            seat === mySeat(s.room)
              ? s.hand.filter((h) => !cards.some((c) => sameCard(c, h)))
              : s.hand,
          selected: [],
        }));
      });

      socket.on('game:passed', ({ seat }) => {
        sounds.pass();
        set((s) => ({ passedSeats: [...s.passedSeats, seat] }));
      });

      socket.on('game:turn', ({ seat, endsAt, newRound }) => {
        const s = get();
        if (seat === mySeat(s.room) && s.room?.status === 'playing') {
          sounds.turn();
        }
        set((prev) => ({
          currentSeat: seat,
          turnEndsAt: endsAt,
          table: newRound ? null : prev.table,
          passedSeats: newRound ? [] : prev.passedSeats,
          playedBySeat: newRound ? {} : prev.playedBySeat,
          lastPlayedSeat: newRound ? -1 : prev.lastPlayedSeat,
        }));
      });

      socket.on('game:ended', (result) => {
        if (result.ranking[0] === getUserId()) sounds.win();
        else sounds.lose();
        const delta = result.coinDelta[getUserId()];
        if (delta !== undefined) useAuth.getState().applyDelta(delta);
        set({ result });
      });

      socket.on('chat:message', (msg) =>
        set((s) => ({ chat: [...s.chat.slice(-49), msg] })),
      );
    },

    quickJoin: (betAmount) =>
      guard(async () => {
        const room = await emitAck<RoomState>('room:quickjoin', { betAmount });
        set({ room, chat: [], result: null });
      }),

    leave: () =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('room:leave', { roomId });
        set({ room: null, hand: [], table: null, result: null });
      }),

    setReady: (ready) =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId) return;
        await emitAck('game:ready', { roomId, ready });
      }),

    toggleSelect(card) {
      set((s) => ({
        selected: s.selected.some((c) => sameCard(c, card))
          ? s.selected.filter((c) => !sameCard(c, card))
          : [...s.selected, card],
      }));
    },

    playSelected: () =>
      guard(async () => {
        const { room, selected } = get();
        if (!room || selected.length === 0) return;
        await emitAck('game:play', {
          roomId: room.id,
          seq: ++seq,
          cards: [...selected].sort((a, b) => cardValue(a) - cardValue(b)),
        });
      }),

    pass: () =>
      guard(async () => {
        const { room } = get();
        if (!room) return;
        await emitAck('game:pass', { roomId: room.id, seq: ++seq });
      }),

    sendChat: (text) =>
      guard(async () => {
        const roomId = get().room?.id;
        if (!roomId || !text.trim()) return;
        await emitAck('chat:send', { roomId, text: text.trim() });
      }),

    dismissResult: () => set({ result: null }),
    clearError: () => set({ error: null }),
  };
});

export function mySeat(room: RoomState | null): number {
  const me = room?.players.find((p) => p.userId === getUserId());
  return me?.seat ?? -1;
}

/** Nước đi hiện tại có hợp lệ không — dùng để bật/tắt nút Đánh */
export function selectionValid(state: {
  hand: Card[];
  selected: Card[];
  table: Combo | null;
}): boolean {
  if (state.selected.length === 0) return false;
  return validatePlay(state.hand, state.selected, state.table) !== null;
}
