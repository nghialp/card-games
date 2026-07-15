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

/** userId khách bền qua reload để server reattach đúng ghế khi reconnect */
function guestId(): string {
  let id = localStorage.getItem('cg:userId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cg:userId', id);
  }
  return id;
}

let socket: GameSocket | null = null;
let activeUserId: string | null = null;

/** id trong phiên chơi hiện tại: account id nếu đăng nhập, không thì guest id */
export function getUserId(): string {
  return activeUserId ?? guestId();
}

export interface SocketSession {
  token: string;
  userId: string;
}

export function connectSocket(displayName: string, session?: SocketSession): GameSocket {
  if (socket) return socket;
  activeUserId = session?.userId ?? null;
  const auth = session
    ? { token: session.token }
    : { userId: guestId(), displayName };
  const opts = { auth, transports: ['websocket' as const] };
  socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
  return socket;
}

/** Gọi khi đăng nhập/đăng xuất — phiên socket kế tiếp sẽ dùng danh tính mới */
export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
  activeUserId = null;
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
