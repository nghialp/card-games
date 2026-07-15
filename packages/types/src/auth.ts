export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface AuthResponse {
  user: AuthUser;
  /** Số dư "củ" 🍠 */
  balance: number;
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  user: AuthUser;
  balance: number;
}
