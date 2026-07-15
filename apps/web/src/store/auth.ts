import { create } from 'zustand';
import type { AuthResponse, AuthUser, MeResponse } from '@card-games/types';
import { api, ApiError } from '../lib/api';
import { resetSocket } from '../lib/socket';

const ACCESS_KEY = 'cg:access';
const REFRESH_KEY = 'cg:refresh';

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_KEY);

interface AuthStore {
  user: AuthUser | null;
  /** Số dư "củ" 🍠 */
  balance: number;
  register(email: string, password: string, displayName: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  /** Gọi khi mở app / về trang chủ — khôi phục phiên + số dư mới nhất */
  loadMe(): Promise<void>;
  /** Cập nhật số dư tại chỗ khi ván kết thúc (server đã ghi DB) */
  applyDelta(delta: number): void;
}

export const useAuth = create<AuthStore>((set, get) => {
  const applyAuth = (res: AuthResponse): void => {
    localStorage.setItem(ACCESS_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    set({ user: res.user, balance: res.balance });
  };

  const tryRefresh = async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      applyAuth(await api<AuthResponse>('/auth/refresh', { body: { refreshToken } }));
      return true;
    } catch {
      return false;
    }
  };

  return {
    user: null,
    balance: 0,

    async register(email, password, displayName) {
      applyAuth(
        await api<AuthResponse>('/auth/register', {
          body: { email, password, displayName },
        }),
      );
      resetSocket();
    },

    async login(email, password) {
      applyAuth(await api<AuthResponse>('/auth/login', { body: { email, password } }));
      resetSocket();
    },

    logout() {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      set({ user: null, balance: 0 });
      resetSocket();
    },

    async loadMe() {
      const token = getAccessToken();
      if (!token) return;
      try {
        const me = await api<MeResponse>('/auth/me', { token });
        set({ user: me.user, balance: me.balance });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401 && (await tryRefresh())) {
          return;
        }
        get().logout();
      }
    },

    applyDelta(delta) {
      if (get().user) set((s) => ({ balance: s.balance + delta }));
    },
  };
});
