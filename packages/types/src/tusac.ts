/** DTO cho Tứ Sắc (protocol) — cấu trúc trùng Tile của @card-games/game-tusac */
export interface TuSacTile {
  /** 0=Tướng 1=Sỹ 2=Tượng 3=Xe 4=Pháo 5=Mã 6=Tốt */
  piece: number;
  /** 0=Đỏ 1=Vàng 2=Xanh 3=Trắng */
  color: number;
}

export interface TuSacSeat {
  userId: string;
  displayName: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  handCount: number;
  /** Các nhóm đã phơi ra bàn */
  melds: TuSacTile[][];
}

export interface TuSacRoomState {
  id: string;
  gameType: 'tusac';
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  betAmount: number;
  maxPlayers: number;
  players: TuSacSeat[];
}

export type TuSacPhase =
  | 'awaiting-draw'
  | 'awaiting-discard'
  | 'awaiting-claims'
  | 'finished';

export interface TuSacMatchState {
  phase: TuSacPhase;
  turn: number;
  pileCount: number;
  pending: { tile: TuSacTile; from: number; kind: 'discard' | 'draw' } | null;
  /** Ghế đang được chờ phản hồi ăn/giật */
  pendingClaimers: number[];
}

export type TuSacResponse =
  | { type: 'pass' }
  | { type: 'win' }
  | { type: 'claim'; tiles: TuSacTile[] };

export interface TuSacResult {
  kind: 'win' | 'draw';
  winner?: number;
  quan?: boolean;
  /** userId → biến động củ */
  coinDelta: Record<string, number>;
}
