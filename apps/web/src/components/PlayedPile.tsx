import { AnimatePresence, motion } from 'framer-motion';
import type { Card } from '@card-games/types';
import { PlayingCard } from './PlayingCard';

export type PilePosition = 'me' | 'left' | 'top' | 'right';

/** Hướng bài "bay vào" theo vị trí ghế người đánh */
const FLY_FROM: Record<PilePosition, { x: number; y: number }> = {
  me: { x: 0, y: 120 },
  top: { x: 0, y: -120 },
  left: { x: -160, y: 0 },
  right: { x: 160, y: 0 },
};

interface Props {
  cards: Card[];
  position: PilePosition;
  /** Đây là combo đang cần chặt (bài mới nhất trên bàn) */
  latest: boolean;
  /** Bài của mình dùng layoutId để FLIP từ tay xuống */
  own: boolean;
}

export function PlayedPile({ cards, position, latest, own }: Props) {
  return (
    <div
      className={`played-pile played-pile--${position} ${
        latest ? 'played-pile--latest' : ''
      }`}
    >
      <AnimatePresence>
        {cards.map((c, i) => {
          const key = `${c.rank}-${c.suit}`;
          return own ? (
            <motion.div
              key={key}
              className="played-pile__card"
              layoutId={`card-${key}`}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ rotate: (i - (cards.length - 1) / 2) * 4 }}
            >
              <PlayingCard card={c} size="small" />
            </motion.div>
          ) : (
            <motion.div
              key={key}
              className="played-pile__card"
              initial={{ ...FLY_FROM[position], opacity: 0, rotate: -12 }}
              animate={{
                x: 0,
                y: 0,
                opacity: 1,
                rotate: (i - (cards.length - 1) / 2) * 4,
              }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{
                type: 'spring',
                stiffness: 350,
                damping: 26,
                delay: i * 0.05,
              }}
            >
              <PlayingCard card={c} size="small" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
