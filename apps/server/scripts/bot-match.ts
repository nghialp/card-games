/**
 * E2E smoke test: 4 bot kết nối server thật, vào chung phòng và chơi
 * nguyên một ván Tiến lên đến khi có kết quả.
 *
 *   pnpm --filter @card-games/server bot:match
 *
 * Yêu cầu server đang chạy (mặc định http://localhost:3000, đổi qua SERVER_URL).
 */
import { io, type Socket } from 'socket.io-client';
import {
  cardValue,
  detectCombo,
  findBeatingCombos,
  sameCard,
  type Combo,
} from '@card-games/game-tienlen';
import type {
  Card,
  ClientToServerEvents,
  RoomState,
  ServerToClientEvents,
} from '@card-games/types';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const BET = Number(process.env.BOT_BET ?? 10);
/** Đặt BOT_COUNT=3 để chừa một ghế cho người thật (bot ready sẵn, chờ bạn) */
const BOTS = Number(process.env.BOT_COUNT ?? 4);
/** Mỗi bot ngừng hành động sau N action — dùng để test restart giữa ván */
const STOP_AFTER = Number(process.env.BOT_STOP_AFTER ?? Infinity);
const TIMEOUT_MS = Number(process.env.BOT_TIMEOUT_MS ?? 90_000);
/** Bot chỉ bấm sẵn sàng khi phòng đủ N người — BOT_READY_AT=4 để chờ người thật */
const READY_AT = Number(process.env.BOT_READY_AT ?? BOTS);

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Bot {
  name: string;
  userId: string;
  socket: BotSocket;
  hand: Card[];
  seat: number;
  seq: number;
  readySent: boolean;
}

let roomId = '';
let table: Combo | null = null;

const label = (c: Card): string =>
  `${c.rank === 15 ? '2' : c.rank === 14 ? 'A' : c.rank === 13 ? 'K' : c.rank === 12 ? 'Q' : c.rank === 11 ? 'J' : c.rank}${'♠♣♦♥'[c.suit]}`;

function emitAck<T>(
  socket: BotSocket,
  event: 'room:quickjoin' | 'room:join' | 'game:ready' | 'game:play' | 'game:pass',
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    (socket as Socket).emit(event, payload, (res: { ok: boolean; data?: T; error?: string }) => {
      res.ok ? resolve(res.data as T) : reject(new Error(res.error));
    });
  });
}

function createBot(i: number): Bot {
  // userId duy nhất theo process — chạy nhiều đợt bot song song không đụng nhau
  const userId = `bot-${process.pid}-${i}`;
  const bot: Bot = {
    name: `Bot${i}`,
    userId,
    socket: io(SERVER_URL, {
      auth: { userId, displayName: `Bot${i}` },
      transports: ['websocket'],
    }),
    hand: [],
    seat: -1,
    seq: 0,
    readySent: false,
  };

  bot.socket.on('room:state', (state: RoomState) => {
    const me = state.players.find((p) => p.userId === bot.userId);
    if (me) bot.seat = me.seat;
    // đủ người thì mới sẵn sàng (một lần duy nhất)
    if (me && !bot.readySent && state.players.length >= READY_AT) {
      bot.readySent = true;
      emitAck(bot.socket, 'game:ready', { roomId: state.id, ready: true }).catch(
        (err) => console.error(`${bot.name} ready failed:`, (err as Error).message),
      );
    }
  });

  bot.socket.on('game:hand', ({ cards }) => {
    bot.hand = cards;
  });

  bot.socket.on('game:played', ({ seat, cards }) => {
    table = detectCombo(cards);
    if (seat === bot.seat) {
      bot.hand = bot.hand.filter((h) => !cards.some((c) => sameCard(c, h)));
    }
    if (bot.seat === 0) {
      console.log(`  seat ${seat} đánh: ${cards.map(label).join(' ')}`);
    }
  });

  bot.socket.on('game:passed', ({ seat }) => {
    if (bot.seat === 0) console.log(`  seat ${seat} bỏ lượt`);
  });

  bot.socket.on('game:turn', ({ seat, newRound }) => {
    if (newRound) table = null;
    if (seat !== bot.seat) return;
    // chờ 30ms cho chắc đã nhận đủ state trước khi hành động
    setTimeout(() => void act(bot), 30);
  });

  bot.socket.on('game:ended', (result) => {
    if (bot.seat !== 0) return;
    console.log('\n🏁 Ván kết thúc!');
    console.log('  Xếp hạng:', result.ranking.join(' > '));
    console.log('  Coin:', JSON.stringify(result.coinDelta));
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 200);
  });

  return bot;
}

async function act(bot: Bot): Promise<void> {
  if (bot.seq >= STOP_AFTER) return;
  try {
    if (table === null) {
      const lowest = [...bot.hand].sort((a, b) => cardValue(a) - cardValue(b))[0];
      if (!lowest) return;
      await emitAck(bot.socket, 'game:play', {
        roomId,
        seq: ++bot.seq,
        cards: [lowest],
      });
      return;
    }
    const options = findBeatingCombos(bot.hand, table);
    if (options.length === 0) {
      await emitAck(bot.socket, 'game:pass', { roomId, seq: ++bot.seq });
      return;
    }
    const cheapest = options.sort((a, b) => a.value - b.value)[0];
    await emitAck(bot.socket, 'game:play', {
      roomId,
      seq: ++bot.seq,
      cards: cheapest.cards,
    });
  } catch (err) {
    // STALE_SEQ xảy ra khi timer server auto-đánh trước bot — bỏ qua
    if ((err as Error).message !== 'STALE_SEQ') {
      console.error(`${bot.name} action failed:`, (err as Error).message);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Kết nối ${BOTS} bot tới ${SERVER_URL}…`);
  const bots = Array.from({ length: BOTS }, (_, i) => createBot(i));

  // Vào phòng tuần tự để cả 4 bot cùng một phòng
  for (const bot of bots) {
    const state = await emitAck<RoomState>(bot.socket, 'room:quickjoin', {
      betAmount: BET,
    });
    roomId = state.id;
  }
  console.log(
    `Cả ${BOTS} bot đã vào phòng ${roomId}, sẵn sàng khi phòng đủ ${READY_AT} người…\n`,
  );

  setTimeout(() => {
    console.error(`❌ Quá ${TIMEOUT_MS / 1000}s ván chưa kết thúc`);
    process.exit(1);
  }, TIMEOUT_MS);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
