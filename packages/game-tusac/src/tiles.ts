/**
 * Mô hình quân bài Tứ Sắc. Bộ bài 112 lá = 7 quân × 4 màu × 4 bản.
 * Xem luật: docs/tusac-rules.md mục 2 & 14.
 */

/** 7 quân (theo cờ tướng). Giá trị số dùng làm chỉ mục ổn định. */
export enum Piece {
  General = 0, // Tướng
  Advisor = 1, // Sỹ
  Elephant = 2, // Tượng
  Chariot = 3, // Xe
  Cannon = 4, // Pháo
  Horse = 5, // Mã
  Soldier = 6, // Tốt (Chốt)
}

/** 4 màu (sắc). */
export enum Color {
  Red = 0, // Đỏ
  Yellow = 1, // Vàng
  Green = 2, // Xanh
  White = 3, // Trắng
}

export const PIECE_COUNT = 7;
export const COLOR_COUNT = 4;
export const COPIES = 4;
export const DECK_SIZE = PIECE_COUNT * COLOR_COUNT * COPIES; // 112

export const PIECE_LABELS = ['Tướng', 'Sỹ', 'Tượng', 'Xe', 'Pháo', 'Mã', 'Tốt'] as const;
export const COLOR_LABELS = ['Đỏ', 'Vàng', 'Xanh', 'Trắng'] as const;

export interface Tile {
  piece: Piece;
  color: Color;
}

/** Nhóm 3 quân "chạy" theo cờ tướng — dùng cho các liền cùng màu */
export const CHARIOT_SET: readonly Piece[] = [Piece.Chariot, Piece.Cannon, Piece.Horse];
export const GENERAL_SET: readonly Piece[] = [Piece.General, Piece.Advisor, Piece.Elephant];

export const tileLabel = (t: Tile): string =>
  `${PIECE_LABELS[t.piece]} ${COLOR_LABELS[t.color]}`;

export const sameTile = (a: Tile, b: Tile): boolean =>
  a.piece === b.piece && a.color === b.color;

/** Chỉ mục 0..27 cho mỗi (quân, màu) — cơ sở cho vector đếm 28 ô */
export const CELL_COUNT = PIECE_COUNT * COLOR_COUNT; // 28
export const cellOf = (piece: Piece, color: Color): number => piece * COLOR_COUNT + color;
export const pieceOfCell = (cell: number): Piece => Math.floor(cell / COLOR_COUNT);
export const colorOfCell = (cell: number): Color => (cell % COLOR_COUNT) as Color;

export function createDeck(): Tile[] {
  const deck: Tile[] = [];
  for (let piece = 0; piece < PIECE_COUNT; piece++) {
    for (let color = 0; color < COLOR_COUNT; color++) {
      for (let copy = 0; copy < COPIES; copy++) {
        deck.push({ piece: piece as Piece, color: color as Color });
      }
    }
  }
  return deck;
}

/** Vector đếm 28 ô: counts[cell] = số lá của (quân, màu) đó (0..4) */
export type Counts = number[];

export function toCounts(tiles: readonly Tile[]): Counts {
  const counts = new Array<number>(CELL_COUNT).fill(0);
  for (const t of tiles) counts[cellOf(t.piece, t.color)]++;
  return counts;
}

export function countsToTiles(counts: Counts): Tile[] {
  const tiles: Tile[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    for (let i = 0; i < counts[cell]; i++) {
      tiles.push({ piece: pieceOfCell(cell), color: colorOfCell(cell) });
    }
  }
  return tiles;
}

/** Nguồn ngẫu nhiên inject được: trả int trong [0, maxExclusive) */
export type Rng = (maxExclusive: number) => number;

/** Fisher–Yates, không đụng mảng gốc */
export function shuffle(deck: readonly Tile[], rng: Rng): Tile[] {
  const tiles = [...deck];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export interface Dealt {
  /** hands[0] là nhà cái (21 lá); còn lại 20 lá */
  hands: Tile[][];
  /** Phần còn lại làm nọc (draw pile) */
  pile: Tile[];
}

/**
 * Chia bài: nhà cái (ghế 0) 21 lá, người khác 20 lá, phần dư làm nọc.
 * numPlayers 2–4.
 */
export function deal(deck: readonly Tile[], numPlayers: number): Dealt {
  if (numPlayers < 2 || numPlayers > 4) throw new Error('numPlayers must be 2..4');
  const tiles = [...deck];
  let idx = 0;
  const hands: Tile[][] = [];
  for (let seat = 0; seat < numPlayers; seat++) {
    const size = seat === 0 ? 21 : 20;
    hands.push(tiles.slice(idx, idx + size));
    idx += size;
  }
  return { hands, pile: tiles.slice(idx) };
}
