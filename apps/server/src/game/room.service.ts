import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  createDeck,
  deal,
  shuffle,
  TienLenMatch,
  type MatchSnapshot,
} from '@card-games/game-tienlen';
import type { Card, MatchResult, RoomState } from '@card-games/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@card-games/types';
import { MetricsService } from '../metrics/metrics.service';
import { MatchPersistenceService } from '../persistence/match-persistence.service';
import { RedisService } from '../persistence/redis.service';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface SessionUser {
  userId: string;
  displayName: string;
}

interface PlayerSession extends SessionUser {
  seat: number;
  ready: boolean;
  connected: boolean;
  socketId: string;
  lastSeq: number;
}

interface Room {
  id: string;
  betAmount: number;
  hostId: string;
  status: RoomState['status'];
  players: PlayerSession[];
  match: TienLenMatch | null;
  matchId: string | null;
  matchStartedAt: number;
  turnTimer: NodeJS.Timeout | null;
  turnEndsAt: number;
}

/** Bản ghi phòng trong Redis — chỉ chứa dữ liệu JSON-serializable */
interface PersistedRoom {
  id: string;
  betAmount: number;
  hostId: string;
  status: RoomState['status'];
  matchId: string | null;
  matchStartedAt: number;
  turnEndsAt: number;
  players: Array<Omit<PlayerSession, 'socketId' | 'connected'>>;
  match: MatchSnapshot | null;
}

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const TURN_MS = Number(process.env.TURN_TIMEOUT_MS ?? 20_000);
const ROOM_KEY_PREFIX = 'room:';

export class RoomError extends Error {}

/**
 * Quản lý phòng + vòng đời ván bài. Nguồn sự thật khi chạy là in-memory,
 * mọi thay đổi được write-through sang Redis; khi server khởi động lại,
 * các ván đang chơi được khôi phục từ Redis (người chơi ở trạng thái
 * mất kết nối cho tới khi socket reconnect).
 *
 * Lưu ý scale ngang: mỗi phòng phải được xử lý bởi đúng một instance
 * (sticky session theo room) — xem docs/game-design.md mục 3.4.
 */
@Injectable()
export class RoomService implements OnModuleInit {
  private readonly logger = new Logger(RoomService.name);
  private readonly rooms = new Map<string, Room>();
  private server: GameServer | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly persistence: MatchPersistenceService,
    private readonly metrics: MetricsService,
  ) {
    this.metrics.setStatsProvider(() => {
      const rooms = [...this.rooms.values()];
      return {
        rooms: rooms.length,
        playersOnline: rooms.reduce(
          (sum, r) => sum + r.players.filter((p) => p.connected).length,
          0,
        ),
        matchesInProgress: rooms.filter((r) => r.status === 'playing').length,
      };
    });
  }

  setServer(server: GameServer): void {
    this.server = server;
  }

  async onModuleInit(): Promise<void> {
    await this.restoreRooms();
  }

  findRoomOfUser(userId: string): RoomState | null {
    const room = this.roomOfUser(userId);
    return room ? this.toRoomState(room) : null;
  }

  quickJoin(user: SessionUser, betAmount: number, socketId: string): RoomState {
    // Mỗi user chỉ ở một phòng: đang giữa ván thì quay về phòng cũ,
    // đang ở phòng chờ khác thì rời trước
    const existing = this.roomOfUser(user.userId);
    if (existing) {
      if (existing.status === 'playing') {
        this.addPlayer(existing, user, socketId);
        return this.toRoomState(existing);
      }
      this.leaveRoom(user.userId);
    }

    let room = [...this.rooms.values()].find(
      (r) =>
        r.status === 'waiting' &&
        r.betAmount === betAmount &&
        r.players.length < MAX_PLAYERS,
    );
    if (!room) {
      room = {
        id: randomUUID().slice(0, 8),
        betAmount,
        hostId: user.userId,
        status: 'waiting',
        players: [],
        match: null,
        matchId: null,
        matchStartedAt: 0,
        turnTimer: null,
        turnEndsAt: 0,
      };
      this.rooms.set(room.id, room);
    }
    this.addPlayer(room, user, socketId);
    return this.toRoomState(room);
  }

  joinRoom(user: SessionUser, roomId: string, socketId: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    const existing = this.roomOfUser(user.userId);
    if (existing && existing.id !== roomId) {
      if (existing.status === 'playing') throw new RoomError('IN_ANOTHER_ROOM');
      this.leaveRoom(user.userId);
    }
    this.addPlayer(room, user, socketId);
    return this.toRoomState(room);
  }

  /** Reconnect: gắn lại socket mới, gửi snapshot riêng cho người đó */
  reattach(user: SessionUser, socketId: string): RoomState | null {
    const room = this.roomOfUser(user.userId);
    if (!room) return null;
    const player = room.players.find((p) => p.userId === user.userId)!;
    player.socketId = socketId;
    player.connected = true;
    this.broadcastRoomState(room);
    if (room.match && room.status === 'playing') {
      this.server?.to(socketId).emit('game:hand', {
        cards: [...room.match.handOf(player.seat)],
      });
      this.server?.to(socketId).emit('game:turn', {
        seat: room.match.currentSeat,
        endsAt: room.turnEndsAt,
        newRound: room.match.tableCombo === null,
      });
    }
    return this.toRoomState(room);
  }

  leaveRoom(userId: string): void {
    const room = this.roomOfUser(userId);
    if (!room) return;
    if (room.status === 'playing') {
      // Đang trong ván: giữ ghế, đánh dấu mất kết nối — timer sẽ auto-pass
      this.markConnected(room, userId, false);
      return;
    }
    room.players = room.players.filter((p) => p.userId !== userId);
    if (room.players.length === 0) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === userId) room.hostId = room.players[0].userId;
    this.broadcastRoomState(room);
    this.persist(room);
  }

  onDisconnect(socketId: string): void {
    // Duyệt hết mọi phòng (không return sớm) — phòng thủ trường hợp
    // một socket còn dấu vết ở nhiều phòng
    for (const room of [...this.rooms.values()]) {
      const player = room.players.find((p) => p.socketId === socketId);
      if (!player) continue;
      if (room.status === 'playing') {
        this.markConnected(room, player.userId, false);
      } else {
        this.leaveRoom(player.userId);
      }
    }
  }

  setReady(roomId: string, userId: string, ready: boolean): void {
    const room = this.getRoom(roomId);
    const player = this.getPlayer(room, userId);
    if (room.status !== 'waiting') throw new RoomError('ALREADY_PLAYING');
    player.ready = ready;
    this.broadcastRoomState(room);
    if (
      room.players.length >= MIN_PLAYERS &&
      room.players.every((p) => p.ready)
    ) {
      this.startMatch(room);
    } else {
      this.persist(room);
    }
  }

  play(roomId: string, userId: string, seq: number, cards: Card[]): void {
    const room = this.getRoom(roomId);
    const player = this.getPlayer(room, userId);
    this.checkSeq(player, seq);
    const match = this.requireMatch(room);

    const outcome = match.play(player.seat, cards);
    this.clearTimer(room);
    this.server?.to(room.id).emit('game:played', {
      seat: player.seat,
      cards: outcome.combo.cards,
      cardsLeft: match.handOf(player.seat).length,
    });
    if (outcome.matchFinished) {
      this.finishMatch(room);
    } else {
      this.emitTurn(room, outcome.newRound);
      this.persist(room);
    }
  }

  pass(roomId: string, userId: string, seq: number): void {
    const room = this.getRoom(roomId);
    const player = this.getPlayer(room, userId);
    this.checkSeq(player, seq);
    const match = this.requireMatch(room);

    const { newRound } = match.pass(player.seat);
    this.clearTimer(room);
    this.server?.to(room.id).emit('game:passed', { seat: player.seat });
    this.emitTurn(room, newRound);
    this.persist(room);
  }

  chat(roomId: string, user: SessionUser, text: string): void {
    const room = this.getRoom(roomId);
    this.server?.to(room.id).emit('chat:message', {
      userId: user.userId,
      displayName: user.displayName,
      text: text.slice(0, 500),
      at: Date.now(),
    });
  }

  // ── vòng đời ván ───────────────────────────────────────────

  private startMatch(room: Room): void {
    const deck = shuffle(createDeck(), (max) => randomInt(max));
    const allHands = deal(deck);
    const hands = room.players.map((_, i) => allHands[i]);

    // Ván đầu: người giữ 3♠ đi trước và phải đánh 3♠.
    // Dưới 4 người, 3♠ có thể nằm ở phần bài thừa → người ghế 0 mở tự do.
    const threeSpades: Card = { rank: 3, suit: 0 };
    let startingSeat = hands.findIndex((h) =>
      h.some((c) => c.rank === 3 && c.suit === 0),
    );
    const requireFirstCard = startingSeat >= 0 ? threeSpades : undefined;
    if (startingSeat < 0) startingSeat = 0;

    room.match = new TienLenMatch(hands, startingSeat, { requireFirstCard });
    room.matchId = randomUUID();
    room.matchStartedAt = Date.now();
    room.status = 'playing';
    for (const p of room.players) p.lastSeq = 0;

    for (const p of room.players) {
      this.server?.to(p.socketId).emit('game:hand', {
        cards: [...room.match.handOf(p.seat)],
      });
    }
    this.broadcastRoomState(room);
    this.emitTurn(room, true);
    this.persist(room);
    this.logger.log(`match ${room.matchId} started in room ${room.id}`);
  }

  private finishMatch(room: Room): void {
    const match = this.requireMatch(room);
    const ranking = match.publicState().ranking;
    const bySeat = new Map(room.players.map((p) => [p.seat, p]));
    const rankedPlayers = ranking.map((seat) => bySeat.get(seat)!);

    // MVP: người thắng ăn tiền cược của tất cả người thua
    const coinDelta: Record<string, number> = {};
    rankedPlayers.forEach((p, i) => {
      coinDelta[p.userId] =
        i === 0 ? room.betAmount * (rankedPlayers.length - 1) : -room.betAmount;
    });

    const result: MatchResult = {
      matchId: room.matchId!,
      ranking: rankedPlayers.map((p) => p.userId),
      coinDelta,
    };
    this.clearTimer(room);
    this.server?.to(room.id).emit('game:ended', result);
    this.metrics.matchesFinished.inc();
    this.logger.log(`match ${room.matchId} finished: ${result.ranking[0]} won`);

    this.persistence
      .recordMatch({
        matchId: room.matchId!,
        gameType: 'tienlen',
        betAmount: room.betAmount,
        startedAt: new Date(room.matchStartedAt),
        players: rankedPlayers.map((p, i) => ({
          userId: p.userId,
          displayName: p.displayName,
          rank: i,
          coinDelta: coinDelta[p.userId],
        })),
      })
      .catch((err) => this.logger.error('failed to persist match result', err));

    room.match = null;
    room.matchId = null;
    room.status = 'waiting';
    for (const p of room.players) p.ready = false;
    room.players = room.players.filter((p) => p.connected);
    if (room.players.length === 0) {
      this.deleteRoom(room);
      return;
    }
    this.broadcastRoomState(room);
    this.persist(room);
  }

  private emitTurn(room: Room, newRound: boolean): void {
    const match = this.requireMatch(room);
    room.turnEndsAt = Date.now() + TURN_MS;
    this.server?.to(room.id).emit('game:turn', {
      seat: match.currentSeat,
      endsAt: room.turnEndsAt,
      newRound,
    });
    room.turnTimer = setTimeout(() => this.onTurnTimeout(room.id), TURN_MS);
  }

  /** Hết giờ: đang cầm cái thì tự đánh lá nhỏ nhất, không thì bỏ lượt */
  private onTurnTimeout(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room?.match || room.status !== 'playing') return;
    const match = room.match;
    const seat = match.currentSeat;
    const player = room.players.find((p) => p.seat === seat);
    if (!player) return;
    try {
      if (match.tableCombo === null) {
        this.play(room.id, player.userId, player.lastSeq + 1, [
          match.handOf(seat)[0],
        ]);
      } else {
        this.pass(room.id, player.userId, player.lastSeq + 1);
      }
    } catch (err) {
      this.logger.error(`turn timeout handling failed in ${roomId}`, err);
    }
  }

  // ── Redis persistence ──────────────────────────────────────

  /** Write-through: gọi sau mỗi thay đổi state đáng lưu (fire-and-forget) */
  private persist(room: Room): void {
    const client = this.redis.client;
    if (!client) return;
    const data: PersistedRoom = {
      id: room.id,
      betAmount: room.betAmount,
      hostId: room.hostId,
      status: room.status,
      matchId: room.matchId,
      matchStartedAt: room.matchStartedAt,
      turnEndsAt: room.turnEndsAt,
      players: room.players.map(({ socketId: _s, connected: _c, ...p }) => p),
      match: room.match?.snapshot() ?? null,
    };
    client
      .set(ROOM_KEY_PREFIX + room.id, JSON.stringify(data))
      .catch((err) => this.logger.error(`persist room ${room.id} failed`, err));
  }

  private deleteRoom(room: Room): void {
    this.clearTimer(room);
    this.rooms.delete(room.id);
    this.redis.client
      ?.del(ROOM_KEY_PREFIX + room.id)
      .catch((err) => this.logger.error(`delete room ${room.id} failed`, err));
  }

  /**
   * Khôi phục các ván đang chơi sau restart. Người chơi ở trạng thái
   * disconnected cho tới khi reconnect; đồng hồ lượt được đặt lại nên
   * ván tiếp tục chạy (vắng mặt thì auto-pass) và vẫn ghi kết quả.
   */
  private async restoreRooms(): Promise<void> {
    const client = this.redis.client;
    if (!client) return;
    const keys = await client.keys(ROOM_KEY_PREFIX + '*');
    let restored = 0;
    for (const key of keys) {
      const raw = await client.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as PersistedRoom;
      if (data.status !== 'playing' || !data.match) {
        await client.del(key); // phòng chờ không đáng khôi phục
        continue;
      }
      const room: Room = {
        id: data.id,
        betAmount: data.betAmount,
        hostId: data.hostId,
        status: data.status,
        matchId: data.matchId,
        matchStartedAt: data.matchStartedAt,
        turnEndsAt: Date.now() + TURN_MS,
        turnTimer: null,
        match: TienLenMatch.restore(data.match),
        players: data.players.map((p) => ({
          ...p,
          socketId: '',
          connected: false,
        })),
      };
      this.rooms.set(room.id, room);
      room.turnTimer = setTimeout(() => this.onTurnTimeout(room.id), TURN_MS);
      restored++;
    }
    if (keys.length > 0) {
      this.logger.log(`restored ${restored}/${keys.length} rooms from Redis`);
    }
  }

  // ── helpers ────────────────────────────────────────────────

  private addPlayer(room: Room, user: SessionUser, socketId: string): void {
    const existing = room.players.find((p) => p.userId === user.userId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      this.broadcastRoomState(room);
      return;
    }
    if (room.status !== 'waiting') throw new RoomError('ALREADY_PLAYING');
    if (room.players.length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL');
    const takenSeats = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (takenSeats.has(seat)) seat++;
    room.players.push({
      ...user,
      seat,
      ready: false,
      connected: true,
      socketId,
      lastSeq: 0,
    });
    this.broadcastRoomState(room);
    this.persist(room);
  }

  private markConnected(room: Room, userId: string, connected: boolean): void {
    const player = room.players.find((p) => p.userId === userId);
    if (!player) return;
    player.connected = connected;
    this.broadcastRoomState(room);
  }

  private broadcastRoomState(room: Room): void {
    this.server?.to(room.id).emit('room:state', this.toRoomState(room));
  }

  private toRoomState(room: Room): RoomState {
    return {
      id: room.id,
      gameType: 'tienlen',
      status: room.status,
      hostId: room.hostId,
      betAmount: room.betAmount,
      maxPlayers: MAX_PLAYERS,
      players: room.players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        seat: p.seat,
        ready: p.ready,
        connected: p.connected,
        cardsLeft: room.match?.handOf(p.seat).length,
      })),
    };
  }

  private roomOfUser(userId: string): Room | undefined {
    return [...this.rooms.values()].find((r) =>
      r.players.some((p) => p.userId === userId),
    );
  }

  private getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    return room;
  }

  private getPlayer(room: Room, userId: string): PlayerSession {
    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new RoomError('NOT_IN_ROOM');
    return player;
  }

  private requireMatch(room: Room): TienLenMatch {
    if (!room.match || room.status !== 'playing') {
      throw new RoomError('NO_ACTIVE_MATCH');
    }
    return room.match;
  }

  /** Chống double-submit khi mạng lag: bỏ action có seq cũ */
  private checkSeq(player: PlayerSession, seq: number): void {
    if (seq <= player.lastSeq) throw new RoomError('STALE_SEQ');
    player.lastSeq = seq;
  }

  private clearTimer(room: Room): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
  }
}
