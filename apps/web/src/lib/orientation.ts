/**
 * Khoá màn hình ngang khi vào bàn chơi — best-effort:
 * chỉ hoạt động trên Android (thường cần fullscreen); iOS Safari không hỗ trợ
 * → đã có overlay CSS "xoay ngang để chơi" làm phương án chính.
 */
export function tryLockLandscape(): void {
  const o = screen.orientation as unknown as {
    lock?: (v: string) => Promise<void>;
  };
  o?.lock?.('landscape').catch(() => {});
}

export function unlockOrientation(): void {
  const o = screen.orientation as unknown as { unlock?: () => void };
  try {
    o?.unlock?.();
  } catch {
    /* ignore */
  }
}
