import type { Card } from './card';
import type { MatchResult, RoomState } from './room';

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
}
