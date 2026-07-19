import type { Card } from './card';
import type { GameType, MatchResult, RoomState, RoomSummary } from './room';
import type {
  TuSacMatchState,
  TuSacResponse,
  TuSacResult,
  TuSacRoomState,
  TuSacTile,
} from './tusac';

/** Mọi ack đều trả về dạng này để client xử lý lỗi thống nhất */
export type Ack<T = void> = (
  res: { ok: true; data: T } | { ok: false; error: string },
) => void;

export interface PlayedPayload {
  seat: number;
  cards: Card[];
  /** Số lá còn lại của người vừa đánh */
  cardsLeft: number;
}

export interface TurnPayload {
  seat: number;
  /** Unix ms — client tự đếm ngược tới mốc này */
  endsAt: number;
  /** true nếu là lượt mở vòng mới (không phải chặt bài trước) */
  newRound: boolean;
}

export interface ChatMessage {
  userId: string;
  displayName: string;
  text: string;
  at: number;
}

/** client → server */
export interface ClientToServerEvents {
  /** Danh sách bàn còn chỗ trong sảnh của một game (sắp ít chỗ trống lên đầu) */
  'room:list': (p: { gameType: GameType }, ack: Ack<RoomSummary[]>) => void;
  'room:create': (
    p: { gameType: GameType; betAmount: number },
    ack: Ack<RoomState>,
  ) => void;
  'room:join': (p: { roomId: string }, ack: Ack<RoomState>) => void;
  'room:leave': (p: { roomId: string }, ack: Ack) => void;
  'room:quickjoin': (p: { betAmount: number }, ack: Ack<RoomState>) => void;
  'game:ready': (p: { roomId: string; ready: boolean }, ack: Ack) => void;
  'game:play': (
    p: { roomId: string; seq: number; cards: Card[] },
    ack: Ack,
  ) => void;
  'game:pass': (p: { roomId: string; seq: number }, ack: Ack) => void;
  'chat:send': (p: { roomId: string; text: string }, ack: Ack) => void;

  // ── Tứ Sắc ──
  'tusac:create': (p: { betAmount: number }, ack: Ack<TuSacRoomState>) => void;
  'tusac:join': (p: { roomId: string }, ack: Ack<TuSacRoomState>) => void;
  'tusac:list': (p: Record<string, never>, ack: Ack<TuSacRoomState[]>) => void;
  'tusac:ready': (p: { roomId: string; ready: boolean }, ack: Ack) => void;
  'tusac:leave': (p: { roomId: string }, ack: Ack) => void;
  'tusac:draw': (p: { roomId: string }, ack: Ack) => void;
  'tusac:discard': (p: { roomId: string; tile: TuSacTile }, ack: Ack) => void;
  'tusac:respond': (
    p: { roomId: string; response: TuSacResponse },
    ack: Ack,
  ) => void;
  'tusac:win': (p: { roomId: string }, ack: Ack) => void;
}

/** server → client */
export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  /** Chỉ gửi riêng cho từng người — không bao giờ broadcast */
  'game:hand': (p: { cards: Card[] }) => void;
  'game:played': (p: PlayedPayload) => void;
  'game:passed': (p: { seat: number }) => void;
  'game:turn': (p: TurnPayload) => void;
  'game:ended': (result: MatchResult) => void;
  'chat:message': (msg: ChatMessage) => void;

  // ── Tứ Sắc ──
  'tusac:room': (state: TuSacRoomState) => void;
  /** Chỉ gửi riêng cho từng người — bài trên tay */
  'tusac:hand': (p: { tiles: TuSacTile[] }) => void;
  'tusac:state': (state: TuSacMatchState) => void;
  'tusac:ended': (result: TuSacResult) => void;
}
