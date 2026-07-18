export type GameType = 'tienlen';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  userId: string;
  displayName: string;
  avatar?: string;
  seat: number;
  ready: boolean;
  /** Số lá còn trên tay — chỉ có khi đang trong ván */
  cardsLeft?: number;
  connected: boolean;
}

export interface RoomState {
  id: string;
  gameType: GameType;
  status: RoomStatus;
  hostId: string;
  betAmount: number;
  maxPlayers: number;
  players: RoomPlayer[];
}

/** Bản tóm tắt phòng để hiển thị trong sảnh (không kèm thông tin ván) */
export interface RoomSummary {
  id: string;
  gameType: GameType;
  betAmount: number;
  playerCount: number;
  maxPlayers: number;
}

export interface MatchResult {
  matchId: string;
  /** userId theo thứ hạng, phần tử 0 là người thắng */
  ranking: string[];
  coinDelta: Record<string, number>;
  /** Có mặt khi ván kết thúc ngay sau chia bài do tới trắng */
  instantWin?: {
    userId: string;
    /** InstantWinType từ game-tienlen: four-pigs | dragon-straight | four-pair-seq | six-pairs */
    type: string;
  };
}
