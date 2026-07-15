import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@card-games/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * VITE_SERVER_URL đặt lúc build/dev khi server ở origin khác (kèm CORS).
 * Không đặt → same-origin: production đi qua nginx proxy /socket.io,
 * dev đi qua vite proxy (vite.config.ts).
 */
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

/** userId bền qua reload để server reattach đúng ghế khi reconnect */
export function getUserId(): string {
  let id = localStorage.getItem('cg:userId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cg:userId', id);
  }
  return id;
}

let socket: GameSocket | null = null;

export function connectSocket(displayName: string): GameSocket {
  if (socket) return socket;
  const opts = {
    auth: { userId: getUserId(), displayName },
    transports: ['websocket' as const],
  };
  socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
  return socket;
}

export function getSocket(): GameSocket {
  if (!socket) throw new Error('socket not connected');
  return socket;
}

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/** emit kèm ack, chuyển lỗi nghiệp vụ thành Error để store xử lý thống nhất */
export function emitAck<T = undefined>(
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    (getSocket() as Socket).emit(event, payload, (res: AckResponse<T>) => {
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}
