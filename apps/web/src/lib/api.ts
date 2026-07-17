const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? String(data.message[0])
          : 'REQUEST_FAILED';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Đổi mã lỗi server thành thông báo tiếng Việt */
export const ERROR_LABELS: Record<string, string> = {
  INVALID_EMAIL: 'Email không hợp lệ',
  PASSWORD_TOO_SHORT: 'Mật khẩu phải từ 6 ký tự',
  INVALID_DISPLAY_NAME: 'Tên hiển thị phải từ 2–20 ký tự',
  EMAIL_TAKEN: 'Email đã được đăng ký',
  INVALID_CREDENTIALS: 'Sai email hoặc mật khẩu',
  INVALID_REFRESH_TOKEN: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại',
  AUTH_REQUIRES_DATABASE: 'Server chưa bật database — không dùng được tài khoản',
  REQUIRES_DATABASE: 'Server chưa bật database',
  REQUEST_FAILED: 'Có lỗi xảy ra, thử lại sau',
  // lỗi từ socket (phòng chơi)
  INSUFFICIENT_BALANCE: 'Không đủ củ 🍠 để vào phòng cược này',
  ROOM_NOT_FOUND: 'Phòng không tồn tại',
  ROOM_FULL: 'Phòng đã đầy',
  ALREADY_PLAYING: 'Phòng đang trong ván',
  IN_ANOTHER_ROOM: 'Bạn đang ở ván khác chưa kết thúc',
  NOT_YOUR_TURN: 'Chưa tới lượt bạn',
  INVALID_PLAY: 'Nước đi không hợp lệ',
  CANNOT_PASS_WHEN_LEADING: 'Đang cầm cái — phải đánh',
};

export const errorLabel = (err: unknown): string => {
  const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
  return ERROR_LABELS[code] ?? code;
};
