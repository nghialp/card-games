import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '@shared-libs/auth';
import { MatchError } from '@card-games/game-tienlen';
import type {
  Card,
  ClientToServerEvents,
  GameType,
  RoomState,
  RoomSummary,
  ServerToClientEvents,
} from '@card-games/types';
import { RoomError, RoomService, type SessionUser } from './room.service';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type AckResponse<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

/**
 * Handshake auth hai chế độ:
 * - Tài khoản: { token } — JWT từ /auth/login, server lấy userId từ token
 *   (client không tự khai được id người khác).
 * - Khách/bot: { userId?, displayName? } — giữ id ở localStorage để reconnect.
 */
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? '*' } })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: GameServer;

  constructor(private readonly rooms: RoomService) {}

  afterInit(server: GameServer): void {
    this.rooms.setServer(server);
  }

  handleConnection(client: GameSocket): void {
    const auth = client.handshake.auth as {
      token?: string;
      userId?: string;
      displayName?: string;
    };
    let user: SessionUser | null = null;
    if (auth.token) {
      try {
        const payload = verifyAccessToken(auth.token, JWT_SECRET);
        user = { userId: payload.sub, displayName: payload.name || 'Người chơi' };
      } catch {
        // token hỏng/hết hạn → chơi tiếp như khách, client sẽ tự refresh sau
        this.logger.warn(`socket ${client.id}: invalid token, falling back to guest`);
      }
    }
    if (!user) {
      user = {
        userId: auth.userId ?? randomUUID(),
        displayName: auth.displayName ?? 'Người chơi',
      };
    }
    client.data.user = user;

    // Reconnect về phòng cũ nếu còn ván đang chơi
    const state = this.rooms.reattach(user, client.id);
    if (state) void client.join(state.id);
  }

  handleDisconnect(client: GameSocket): void {
    this.rooms.onDisconnect(client.id);
  }

  @SubscribeMessage('room:list')
  listRooms(
    @MessageBody() body: { gameType: GameType },
  ): AckResponse<RoomSummary[]> {
    return this.ack(() => this.rooms.listRooms(body?.gameType ?? 'tienlen'));
  }

  @SubscribeMessage('room:create')
  createRoom(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { gameType: GameType; betAmount: number },
  ): Promise<AckResponse<RoomState>> {
    return this.ackAsync(async () => {
      const state = await this.rooms.createRoom(
        this.user(client),
        body?.gameType ?? 'tienlen',
        body?.betAmount ?? 0,
        client.id,
      );
      void client.join(state.id);
      return state;
    });
  }

  @SubscribeMessage('room:quickjoin')
  quickJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { betAmount: number },
  ): Promise<AckResponse<RoomState>> {
    return this.ackAsync(async () => {
      const state = await this.rooms.quickJoin(
        this.user(client),
        body?.betAmount ?? 0,
        client.id,
      );
      void client.join(state.id);
      return state;
    });
  }

  @SubscribeMessage('room:join')
  join(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string },
  ): Promise<AckResponse<RoomState>> {
    return this.ackAsync(async () => {
      const state = await this.rooms.joinRoom(
        this.user(client),
        body?.roomId,
        client.id,
      );
      void client.join(state.id);
      return state;
    });
  }

  @SubscribeMessage('room:leave')
  leave(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string },
  ): AckResponse {
    return this.ack(() => {
      // Rời socket room TRƯỚC: broadcast room:state sau đó (trong leaveRoom)
      // không tới người vừa rời → client không vô tình dựng lại phòng cũ
      void client.leave(body?.roomId);
      this.rooms.leaveRoom(this.user(client).userId);
      return undefined;
    });
  }

  @SubscribeMessage('game:ready')
  ready(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string; ready: boolean },
  ): AckResponse {
    return this.ack(() => {
      this.rooms.setReady(body?.roomId, this.user(client).userId, !!body?.ready);
      return undefined;
    });
  }

  @SubscribeMessage('game:play')
  play(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string; seq: number; cards: Card[] },
  ): AckResponse {
    return this.ack(() => {
      this.rooms.play(
        body?.roomId,
        this.user(client).userId,
        body?.seq,
        body?.cards ?? [],
      );
      return undefined;
    });
  }

  @SubscribeMessage('game:pass')
  pass(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string; seq: number },
  ): AckResponse {
    return this.ack(() => {
      this.rooms.pass(body?.roomId, this.user(client).userId, body?.seq);
      return undefined;
    });
  }

  @SubscribeMessage('chat:send')
  chat(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId: string; text: string },
  ): AckResponse {
    return this.ack(() => {
      this.rooms.chat(body?.roomId, this.user(client), body?.text ?? '');
      return undefined;
    });
  }

  private user(client: GameSocket): SessionUser {
    return client.data.user as SessionUser;
  }

  /** Gói lỗi nghiệp vụ vào ack thay vì làm rớt socket */
  private ack<T>(fn: () => T): AckResponse<T> {
    try {
      return { ok: true, data: fn() };
    } catch (err) {
      return this.toAckError(err);
    }
  }

  private async ackAsync<T>(fn: () => Promise<T>): Promise<AckResponse<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      return this.toAckError(err);
    }
  }

  private toAckError(err: unknown): { ok: false; error: string } {
    if (err instanceof RoomError || err instanceof MatchError) {
      return { ok: false, error: err.message };
    }
    this.logger.error('unexpected gateway error', err);
    return { ok: false, error: 'INTERNAL' };
  }
}
