import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  /** userId */
  sub: string;
  /** displayName */
  name: string;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresInSeconds = 15 * 60,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
}

/** Ném lỗi nếu token sai/hết hạn */
export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('INVALID_TOKEN');
  }
  const name = (decoded as Record<string, unknown>).name;
  return { sub: decoded.sub, name: typeof name === 'string' ? name : '' };
}
