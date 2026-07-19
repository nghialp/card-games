/**
 * E2E smoke test Tứ Sắc: 4 bot vào một phòng và chơi trọn ván.
 *   pnpm --filter @card-games/server tusac:bot
 * Yêu cầu server đang chạy (SERVER_URL, mặc định http://localhost:3000).
 */
import { io, type Socket } from 'socket.io-client';
import {
  canWin,
  isTenpai,
  isWinningHand,
  legalClaims,
  maxMeldCover,
  type Tile,
} from '@card-games/game-tusac';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TuSacMatchState,
  TuSacRoomState,
  TuSacTile,
} from '@card-games/types';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const BET = Number(process.env.BOT_BET ?? 10);
/** Đặt BOT_COUNT=3 + BOT_READY_AT=4 để chừa ghế chờ người thật */
const BOTS = Number(process.env.BOT_COUNT ?? 4);
const READY_AT = Number(process.env.BOT_READY_AT ?? BOTS);
const TIMEOUT_MS = Number(process.env.BOT_TIMEOUT_MS ?? 60_000);

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Bot {
  name: string;
  userId: string;
  socket: BotSocket;
  seat: number;
  hand: Tile[];
  readySent: boolean;
}

let roomId = '';

const emitAck = <T>(socket: BotSocket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    (socket as Socket).emit(event, payload, (res: { ok: boolean; data?: T; error?: string }) => {
      res.ok ? resolve(res.data as T) : reject(new Error(res.error));
    });
  });

const mostRac = (hand: Tile[]): Tile => {
  let bestIdx = 0;
  let bestCover = -1;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.slice(0, i).concat(hand.slice(i + 1));
    const cover = maxMeldCover(rest);
    if (cover > bestCover) {
      bestCover = cover;
      bestIdx = i;
    }
  }
  return hand[bestIdx];
};

function createBot(i: number): Bot {
  const userId = `tsbot-${process.pid}-${i}`;
  const bot: Bot = {
    name: `Bot${i}`,
    userId,
    socket: io(SERVER_URL, {
      auth: { userId, displayName: `Bot${i}` },
      transports: ['websocket'],
    }),
    seat: -1,
    hand: [],
    readySent: false,
  };

  bot.socket.on('tusac:room', (room: TuSacRoomState) => {
    const me = room.players.find((p) => p.userId === userId);
    if (me) bot.seat = me.seat;
    // đủ người thì mới sẵn sàng (một lần duy nhất)
    if (me && !bot.readySent && room.status === 'waiting' && room.players.length >= READY_AT) {
      bot.readySent = true;
      emitAck(bot.socket, 'tusac:ready', { roomId: room.id, ready: true }).catch((err) =>
        console.error(`${bot.name} ready failed:`, (err as Error).message),
      );
    }
  });

  bot.socket.on('tusac:hand', ({ tiles }) => {
    bot.hand = tiles as Tile[];
  });

  bot.socket.on('tusac:state', (st: TuSacMatchState) => {
    void act(bot, st);
  });

  bot.socket.on('tusac:ended', (result) => {
    if (bot.seat !== 0) return;
    console.log('\n🏁 Ván Tứ Sắc kết thúc!');
    console.log(`  Kết cục: ${result.kind}` + (result.winner !== undefined ? ` — thắng: ghế ${result.winner}${result.quan ? ' (TỚI QUAN)' : ''}` : ''));
    console.log('  Coin:', JSON.stringify(result.coinDelta));
    setTimeout(() => process.exit(0), 200);
  });

  return bot;
}

async function act(bot: Bot, st: TuSacMatchState): Promise<void> {
  try {
    if (st.phase === 'awaiting-draw' && st.turn === bot.seat) {
      await emitAck(bot.socket, 'tusac:draw', { roomId });
    } else if (st.phase === 'awaiting-discard' && st.turn === bot.seat) {
      if (bot.hand.length === 0 || isWinningHand(bot.hand)) {
        await emitAck(bot.socket, 'tusac:win', { roomId });
      } else {
        await emitAck(bot.socket, 'tusac:discard', { roomId, tile: mostRac(bot.hand) as TuSacTile });
      }
    } else if (st.phase === 'awaiting-claims' && st.pendingClaimers.includes(bot.seat)) {
      const tile = st.pending!.tile as Tile;
      if (canWin(bot.hand, tile)) {
        await emitAck(bot.socket, 'tusac:respond', { roomId, response: { type: 'win' } });
        return;
      }
      const claims = legalClaims(bot.hand, tile, {
        isOwnTurn: st.pending!.gate === bot.seat, // "đúng cửa" mới ăn được rác/lẻ
        waitingToWin: isTenpai(bot.hand),
      });
      const pick = claims.find((c) => c.mandatory) ?? claims[0];
      await emitAck(bot.socket, 'tusac:respond', {
        roomId,
        response: pick ? { type: 'claim', tiles: pick.fromHand as TuSacTile[] } : { type: 'pass' },
      });
    }
  } catch (err) {
    // WRONG_PHASE / NOT_YOUR_TURN khi state đã cũ — bỏ qua
    const msg = (err as Error).message;
    const benign = ['WRONG_PHASE', 'NOT_YOUR_TURN', 'NOT_ELIGIBLE', 'ALREADY_RESPONDED', 'NOT_CLAIM_PHASE', 'NO_MATCH', 'ROOM_NOT_FOUND', 'NOT_WINNING'];
    if (!benign.includes(msg)) {
      console.error(`${bot.name}:`, msg);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Kết nối ${BOTS} bot tới ${SERVER_URL}…`);
  const bots = Array.from({ length: BOTS }, (_, i) => createBot(i));
  // socket có thể đã connect trước khi handler đăng ký → check .connected trước
  for (const b of bots) {
    await new Promise<void>((r) =>
      b.socket.connected ? r() : b.socket.once('connect', () => r()),
    );
  }

  const room = await emitAck<TuSacRoomState>(bots[0].socket, 'tusac:create', { betAmount: BET });
  roomId = room.id;
  for (let i = 1; i < BOTS; i++) {
    await emitAck(bots[i].socket, 'tusac:join', { roomId });
  }
  console.log(`Cả ${BOTS} bot vào phòng ${roomId}, sẵn sàng khi đủ ${READY_AT} người…\n`);

  setTimeout(() => {
    console.error(`❌ Quá ${TIMEOUT_MS / 1000}s ván chưa kết thúc`);
    process.exit(1);
  }, TIMEOUT_MS);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
