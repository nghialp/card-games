import type { GameType } from '@card-games/types';

export interface GameInfo {
  /** type khớp GameType khi available; game sắp ra mắt dùng string tạm */
  type: GameType | string;
  name: string;
  emoji: string;
  players: string;
  available: boolean;
}

export const GAMES: GameInfo[] = [
  { type: 'tienlen', name: 'Tiến Lên Miền Nam', emoji: '🃏', players: '2–4 người', available: true },
  { type: 'phom', name: 'Phỏm (Tá Lả)', emoji: '🀄', players: '2–4 người', available: false },
  { type: 'binh', name: 'Mậu Binh', emoji: '🎴', players: '2–4 người', available: false },
  { type: 'tusac', name: 'Tứ Sắc', emoji: '🔴', players: '2–4 người', available: false },
  { type: 'poker', name: 'Poker', emoji: '♠️', players: '2–9 người', available: false },
];

export const gameName = (type: string): string =>
  GAMES.find((g) => g.type === type)?.name ?? type;
