import type { Tile } from '@card-games/game-tusac';

/**
 * Quân bài theo bộ bài Tứ Sắc thật:
 * - Nền theo sắc (đỏ/vàng/xanh/trắng), chữ ĐEN in đậm trên mọi màu.
 * - Đỏ & Vàng dùng bộ chữ bên soái: 帥 仕 相 俥 砲 傌 兵
 * - Xanh & Trắng dùng bộ chữ bên tướng: 將 士 象 車 炮 馬 卒
 * (thứ tự: Tướng, Sỹ, Tượng, Xe, Pháo, Mã, Tốt)
 */
const CHARS_RED_SIDE = ['帥', '仕', '相', '俥', '砲', '傌', '兵'] as const; // Đỏ + Vàng
const CHARS_BLACK_SIDE = ['將', '士', '象', '車', '炮', '馬', '卒'] as const; // Xanh + Trắng

const PIECE_NAMES = ['Tướng', 'Sỹ', 'Tượng', 'Xe', 'Pháo', 'Mã', 'Tốt'] as const;
const COLOR_NAMES = ['Đỏ', 'Vàng', 'Xanh', 'Trắng'] as const;
/** Nền lá bài: Đỏ, Vàng, Xanh, Trắng — theo bộ bài giấy */
const COLOR_BG = ['#e05a20', '#f2d024', '#3fae4f', '#f7f4ec'] as const;

const tileChar = (t: Tile): string =>
  t.color === 0 || t.color === 1 ? CHARS_RED_SIDE[t.piece] : CHARS_BLACK_SIDE[t.piece];

export const tusacTileLabel = (t: Tile): string =>
  `${PIECE_NAMES[t.piece]} ${COLOR_NAMES[t.color]}`;

interface Props {
  tile: Tile;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}

export function TuSacTileView({ tile, selected, onClick, size = 'normal' }: Props) {
  return (
    <button
      type="button"
      className={[
        'ts-tile',
        size === 'small' && 'ts-tile--small',
        selected && 'ts-tile--selected',
        onClick && 'ts-tile--clickable',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ background: COLOR_BG[tile.color] }}
      onClick={onClick}
      disabled={!onClick}
      title={tusacTileLabel(tile)}
    >
      <span className="ts-tile__cap" />
      <span className="ts-tile__char">{tileChar(tile)}</span>
      <span className="ts-tile__name">{PIECE_NAMES[tile.piece]}</span>
      <span className="ts-tile__cap" />
    </button>
  );
}
