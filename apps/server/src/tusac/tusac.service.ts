import { Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  canWin,
  createDeck,
  deal,
  isTenpai,
  isWinningHand,
  legalClaims,
  maxMeldCover,
  scoreMatch,
  shuffle,
  TuSacMatch,
  type Tile,
} from '@card-games/game-tusac';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TuSacResponse,
  TuSacRoomState,
  TuSacTile,
} from '@card-games/types';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface SessionUser {
  userId: string;
  displayName: string;
}

interface Player extends SessionUser {
  seat: number;
  ready: boolean;
  connected: boolean;
  socketId: string;
}

interface Room {
  id: string;
  betAmount: number;
  hostId: string;
  /** Nhà cái: ván đầu là người vào trước; ván sau là người vừa tới (§3) */
  dealerUserId: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Player[];
  match: TuSacMatch | null;
  matchStartedAt: number;
  turnTimer: NodeJS.Timeout | null;
  claimTimer: NodeJS.Timeout | null;
  /** Unix ms — hạn chót phase hiện tại (đếm ngược phía client) */
  deadline: number;
}

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const TURN_MS = Number(process.env.TUSAC_TURN_MS ?? 20_000);
const CLAIM_MS = Number(process.env.TUSAC_CLAIM_MS ?? 12_000);

export class TuSacError extends Error {}

/**
 * Quản lý phòng + vòng đời ván Tứ Sắc (in-memory). Dùng engine @card-games/game-tusac.
 * TODO(T4b): tích hợp lobby chung + Redis persistence + lưu kết quả vào Postgres.
 */
@Injectable()
export class TuSacService {
  private readonly logger = new Logger(TuSacService.name);
  private readonly rooms = new Map<string, Room>();
  private server: GameServer | null = null;

  setServer(server: GameServer): void {
    this.server = server;
  }

  create(user: SessionUser, betAmount: number, socketId: string): TuSacRoomState {
    this.leaveAll(user.userId);
    const room: Room = {
      id: randomUUID().slice(0, 8),
      betAmount,
      hostId: user.userId,
      dealerUserId: user.userId, // vào phòng trước = cầm cái ván đầu
      status: 'waiting',
      players: [],
      match: null,
      matchStartedAt: 0,
      turnTimer: null,
      claimTimer: null,
      deadline: 0,
    };
    this.rooms.set(room.id, room);
    this.addPlayer(room, user, socketId);
    return this.roomState(room);
  }

  join(user: SessionUser, roomId: string, socketId: string): TuSacRoomState {
    const room = this.getRoom(roomId);
    this.leaveAll(user.userId, roomId);
    this.addPlayer(room, user, socketId);
    return this.roomState(room);
  }

  list(): TuSacRoomState[] {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'waiting' && r.players.length < MAX_PLAYERS)
      .map((r) => this.roomState(r))
      .sort(
        (a, b) =>
          a.maxPlayers - a.players.length - (b.maxPlayers - b.players.length),
      );
  }

  setReady(roomId: string, userId: string, ready: boolean): void {
    const room = this.getRoom(roomId);
    if (room.status !== 'waiting') throw new TuSacError('ALREADY_PLAYING');
    const p = this.getPlayer(room, userId);
    p.ready = ready;
    this.broadcastRoom(room);
    if (room.players.length >= MIN_PLAYERS && room.players.every((x) => x.ready)) {
      this.startMatch(room);
    }
  }

  leave(userId: string): void {
    this.leaveAll(userId);
  }

  // ── Hành động trong ván ──────────────────────────────────

  draw(roomId: string, userId: string): void {
    const { room, seat } = this.playing(roomId, userId);
    room.match!.draw(seat);
    this.advance(room);
  }

  discard(roomId: string, userId: string, tile: TuSacTile): void {
    const { room, seat } = this.playing(roomId, userId);
    room.match!.discard(seat, tile as Tile);
    this.advance(room);
  }

  declareWin(roomId: string, userId: string): void {
    const { room, seat } = this.playing(roomId, userId);
    room.match!.declareWin(seat);
    this.advance(room);
  }

  respond(roomId: string, userId: string, response: TuSacResponse): void {
    const { room, seat } = this.playing(roomId, userId);
    room.match!.respondClaim(seat, response as never);
    this.advance(room);
  }

  onDisconnect(socketId: string): void {
    for (const room of [...this.rooms.values()]) {
      const p = room.players.find((x) => x.socketId === socketId);
      if (!p) continue;
      if (room.status === 'playing') {
        p.connected = false;
        this.broadcastRoom(room);
      } else {
        this.leaveAll(p.userId);
      }
    }
  }

  // ── Vòng đời ván ─────────────────────────────────────────

  private startMatch(room: Room): void {
    // Dồn ghế liên tục 0..n-1 (có thể thủng sau khi người rời phòng chờ)
    room.players.sort((a, b) => a.seat - b.seat);
    room.players.forEach((p, i) => (p.seat = i));

    // Nhà cái: người vào trước (ván đầu) / người vừa tới (ván sau)
    let dealerSeat = room.players.findIndex((p) => p.userId === room.dealerUserId);
    if (dealerSeat === -1) {
      dealerSeat = 0;
      room.dealerUserId = room.players[0].userId;
    }

    const rng = (max: number): number => randomInt(max);
    const { hands, pile } = deal(shuffle(createDeck(), rng), room.players.length, dealerSeat);
    room.match = new TuSacMatch(hands, pile, dealerSeat);
    room.matchStartedAt = Date.now();
    room.status = 'playing';
    this.logger.log(`tusac match started in room ${room.id} (dealer seat ${dealerSeat})`);
    this.advance(room);
  }

  /** Sau mỗi hành động: phát state + bài riêng, đặt timer theo phase. */
  private advance(room: Room): void {
    this.clearTimers(room);
    const m = room.match;
    if (!m) return;
    // Hạn chót phase hiện tại — client hiển thị đếm ngược
    room.deadline =
      m.phase === 'awaiting-claims'
        ? Date.now() + CLAIM_MS
        : m.phase === 'finished'
          ? 0
          : Date.now() + TURN_MS;
    // Gửi bài riêng TRƯỚC state để client xử lý state với bài mới nhất
    this.broadcastRoom(room);
    this.sendHands(room);
    this.broadcastMatchState(room);

    switch (m.phase) {
      case 'awaiting-draw':
      case 'awaiting-discard':
        room.turnTimer = setTimeout(() => this.autoTurn(room.id), TURN_MS);
        break;
      case 'awaiting-claims':
        room.claimTimer = setTimeout(() => this.autoClaims(room.id), CLAIM_MS);
        break;
      case 'finished':
        this.finishMatch(room);
        break;
    }
  }

  /** Hết giờ lượt: tự bốc / tự tới nếu tròn / bỏ lá rác nhất. */
  private autoTurn(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room?.match || room.status !== 'playing') return;
    const m = room.match;
    const seat = m.turn;
    try {
      if (m.phase === 'awaiting-draw') {
        m.draw(seat);
      } else if (m.phase === 'awaiting-discard') {
        const hand = m.handOf(seat);
        if (hand.length === 0 || isWinningHand(hand)) m.declareWin(seat);
        else m.discard(seat, this.mostRac(hand));
      }
      this.advance(room);
    } catch (err) {
      this.logger.error(`autoTurn failed in ${roomId}`, err);
    }
  }

  /** Hết giờ cửa sổ ăn: người còn lại tự khui/đôi (bắt buộc) hoặc bỏ. */
  private autoClaims(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room?.match || room.status !== 'playing') return;
    const m = room.match;
    try {
      let guard = 0;
      while (m.phase === 'awaiting-claims' && guard++ < MAX_PLAYERS + 1) {
        const st = m.publicState();
        const seat = st.pendingClaimers[0];
        if (seat === undefined) break;
        const tile = st.pending!.tile as Tile;
        const hand = m.handOf(seat);
        const claims = legalClaims(hand, tile, {
          isOwnTurn: seat === st.pending!.gate,
          waitingToWin: isTenpai(hand),
        });
        const mand = claims.find((c) => c.mandatory);
        if (!canWin(hand, tile) && mand) {
          m.respondClaim(seat, { type: 'claim', tiles: mand.fromHand });
        } else {
          m.respondClaim(seat, { type: 'pass' });
        }
      }
      this.advance(room);
    } catch (err) {
      this.logger.error(`autoClaims failed in ${roomId}`, err);
    }
  }

  private finishMatch(room: Room): void {
    const m = room.match!;
    const res = m.result!;
    const bySeat = new Map(room.players.map((p) => [p.seat, p]));

    let coinDelta: Record<string, number> = {};
    let winnerSeat: number | undefined;
    let quan = false;

    if (res.kind === 'win' && res.winner !== undefined) {
      winnerSeat = res.winner;
      quan = !!res.quan;
      // Ai tới thì ván sau cầm cái (§3)
      const winner = bySeat.get(res.winner);
      if (winner) room.dealerUserId = winner.userId;
      const seats = m.publicState().seats;
      const winnerTiles = [
        ...m.handOf(res.winner),
        ...seats[res.winner].melds.flat(),
      ];
      const score = scoreMatch({
        result: res,
        numPlayers: room.players.length,
        betAmount: room.betAmount,
        winnerTiles,
      });
      for (const [seat, delta] of Object.entries(score.coinDelta)) {
        const p = bySeat.get(Number(seat));
        if (p) coinDelta[p.userId] = delta;
      }
    } else {
      coinDelta = Object.fromEntries(room.players.map((p) => [p.userId, 0]));
    }

    this.server?.to(room.id).emit('tusac:ended', {
      kind: res.kind,
      winner: winnerSeat,
      quan,
      coinDelta,
    });
    this.logger.log(
      `tusac match finished in ${room.id}: ${res.kind}${winnerSeat !== undefined ? ` winner seat ${winnerSeat}${quan ? ' (quan)' : ''}` : ''}`,
    );
    // TODO(T4b): ghi kết quả + cộng/trừ ví vào Postgres

    this.clearTimers(room);
    room.match = null;
    room.status = 'waiting';
    for (const p of room.players) p.ready = false;
    room.players = room.players.filter((p) => p.connected);
    if (room.players.length === 0) {
      this.rooms.delete(room.id);
      return;
    }
    this.broadcastRoom(room);
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Lá bỏ đi mà vẫn giữ độ phủ nhóm cao nhất = lá "rác nhất" */
  private mostRac(hand: readonly Tile[]): Tile {
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
  }

  private addPlayer(room: Room, user: SessionUser, socketId: string): void {
    if (room.players.some((p) => p.userId === user.userId)) {
      const p = this.getPlayer(room, user.userId);
      p.socketId = socketId;
      p.connected = true;
      this.broadcastRoom(room);
      return;
    }
    if (room.status !== 'waiting') throw new TuSacError('ALREADY_PLAYING');
    if (room.players.length >= MAX_PLAYERS) throw new TuSacError('ROOM_FULL');
    const taken = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    room.players.push({ ...user, seat, ready: false, connected: true, socketId });
    this.broadcastRoom(room);
  }

  private leaveAll(userId: string, exceptRoomId?: string): void {
    for (const room of [...this.rooms.values()]) {
      if (room.id === exceptRoomId) continue;
      if (!room.players.some((p) => p.userId === userId)) continue;
      if (room.status === 'playing') {
        const p = room.players.find((x) => x.userId === userId)!;
        p.connected = false;
        this.broadcastRoom(room);
        continue;
      }
      // Nhà cái rời phòng → người kế (bên phải) cầm cái (§3)
      if (room.dealerUserId === userId) {
        const sorted = [...room.players].sort((a, b) => a.seat - b.seat);
        const idx = sorted.findIndex((p) => p.userId === userId);
        const next = sorted[(idx + 1) % sorted.length];
        if (next && next.userId !== userId) room.dealerUserId = next.userId;
      }
      room.players = room.players.filter((p) => p.userId !== userId);
      if (room.players.length === 0) {
        this.clearTimers(room);
        this.rooms.delete(room.id);
      } else {
        if (room.hostId === userId) room.hostId = room.players[0].userId;
        this.broadcastRoom(room);
      }
    }
  }

  private roomState(room: Room): TuSacRoomState {
    const seats = room.match?.publicState().seats;
    return {
      id: room.id,
      gameType: 'tusac',
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
        handCount: seats?.[p.seat]?.handCount ?? 0,
        melds: (seats?.[p.seat]?.melds ?? []) as TuSacTile[][],
      })),
    };
  }

  private broadcastRoom(room: Room): void {
    this.server?.to(room.id).emit('tusac:room', this.roomState(room));
  }

  private broadcastMatchState(room: Room): void {
    const s = room.match!.publicState();
    this.server?.to(room.id).emit('tusac:state', {
      phase: s.phase,
      turn: s.turn,
      pileCount: s.pileCount,
      pending: s.pending as never,
      pendingClaimers: s.pendingClaimers,
      discards: s.discards as TuSacTile[],
      endsAt: room.deadline || undefined,
    });
  }

  private sendHands(room: Room): void {
    for (const p of room.players) {
      this.server?.to(p.socketId).emit('tusac:hand', {
        tiles: [...room.match!.handOf(p.seat)] as TuSacTile[],
      });
    }
  }

  private playing(roomId: string, userId: string): { room: Room; seat: number } {
    const room = this.getRoom(roomId);
    if (!room.match || room.status !== 'playing') throw new TuSacError('NO_MATCH');
    return { room, seat: this.getPlayer(room, userId).seat };
  }

  private getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new TuSacError('ROOM_NOT_FOUND');
    return room;
  }

  private getPlayer(room: Room, userId: string): Player {
    const p = room.players.find((x) => x.userId === userId);
    if (!p) throw new TuSacError('NOT_IN_ROOM');
    return p;
  }

  private clearTimers(room: Room): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.claimTimer) clearTimeout(room.claimTimer);
    room.turnTimer = null;
    room.claimTimer = null;
  }
}
