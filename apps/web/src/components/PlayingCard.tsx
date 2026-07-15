import type { Card } from '@card-games/types';

const RANK_LABELS: Record<number, string> = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
};
const SUITS = ['♠', '♣', '♦', '♥'] as const;

export const cardLabel = (c: Card): string =>
  `${RANK_LABELS[c.rank] ?? c.rank}${SUITS[c.suit]}`;

interface Props {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}

export function PlayingCard({ card, selected, onClick, size = 'normal' }: Props) {
  const red = card.suit >= 2;
  return (
    <button
      type="button"
      className={[
        'card',
        size === 'small' && 'card--small',
        red ? 'card--red' : 'card--black',
        selected && 'card--selected',
        onClick && 'card--clickable',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="card__corner">
        {RANK_LABELS[card.rank] ?? card.rank}
        <em>{SUITS[card.suit]}</em>
      </span>
      <span className="card__pip">{SUITS[card.suit]}</span>
    </button>
  );
}

export function CardBack({ size = 'small' }: { size?: 'normal' | 'small' }) {
  return <div className={`card card-back ${size === 'small' ? 'card--small' : ''}`} />;
}
