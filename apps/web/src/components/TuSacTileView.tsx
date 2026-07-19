import type { Tile } from '@card-games/game-tusac';

/** Ký tự Hán trên quân bài Tứ Sắc + tên tiếng Việt */
const PIECE_CHARS = ['將', '仕', '象', '車', '砲', '馬', '卒'] as const;
const PIECE_NAMES = ['Tướng', 'Sỹ', 'Tượng', 'Xe', 'Pháo', 'Mã', 'Tốt'] as const;
/** Đỏ, Vàng, Xanh, Trắng */
const COLOR_HEX = ['#c0392b', '#c98f00', '#1e7e34', '#5d6d7e'] as const;
const COLOR_NAMES = ['Đỏ', 'Vàng', 'Xanh', 'Trắng'] as const;

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
      style={{ color: COLOR_HEX[tile.color] }}
      onClick={onClick}
      disabled={!onClick}
      title={tusacTileLabel(tile)}
    >
      <span className="ts-tile__char">{PIECE_CHARS[tile.piece]}</span>
      <span className="ts-tile__name">{PIECE_NAMES[tile.piece]}</span>
    </button>
  );
}
