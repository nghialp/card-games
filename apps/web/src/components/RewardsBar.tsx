import { useCallback, useEffect, useState } from 'react';
import type { ClaimResponse, RewardsStatus } from '@card-games/types';
import { api, errorLabel } from '../lib/api';
import { getAccessToken, useAuth } from '../store/auth';

/** Khu "nhận củ miễn phí" trên trang chủ: điểm danh + xem quảng cáo */
export function RewardsBar({ onShop }: { onShop: () => void }) {
  const [status, setStatus] = useState<RewardsStatus | null>(null);
  const [message, setMessage] = useState('');
  const [adOpen, setAdOpen] = useState(false);

  const refresh = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    api<RewardsStatus>('/rewards/status', { token })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  const checkin = async () => {
    try {
      const res = await api<ClaimResponse>('/rewards/checkin', {
        token: getAccessToken() ?? undefined,
        method: 'POST',
      });
      useAuth.setState({ balance: res.balance });
      setMessage(`📅 +${res.reward} củ — chuỗi ${res.streak} ngày!`);
      refresh();
    } catch (err) {
      setMessage(errorLabel(err));
    }
  };

  const onAdDone = async () => {
    setAdOpen(false);
    try {
      const res = await api<ClaimResponse>('/rewards/ad', {
        token: getAccessToken() ?? undefined,
        method: 'POST',
      });
      useAuth.setState({ balance: res.balance });
      setMessage(`📺 +${res.reward} củ!`);
      refresh();
    } catch (err) {
      setMessage(errorLabel(err));
    }
  };

  if (!status) return null;
  const adsLeft = status.adDailyLimit - status.adsWatchedToday;

  return (
    <div className="rewards">
      <div className="rewards__buttons">
        <button
          className="btn btn--reward"
          disabled={status.checkedInToday}
          onClick={() => void checkin()}
        >
          {status.checkedInToday
            ? '📅 Đã điểm danh ✓'
            : `📅 Điểm danh +${status.nextReward} 🍠`}
        </button>
        <button
          className="btn btn--reward"
          disabled={adsLeft <= 0}
          onClick={() => setAdOpen(true)}
        >
          📺 Xem QC +{status.adReward} 🍠 ({adsLeft}/{status.adDailyLimit})
        </button>
        <button className="btn btn--reward" onClick={onShop}>
          💰 Nạp củ
        </button>
      </div>
      {message && <div className="rewards__msg">{message}</div>}
      {adOpen && <AdModal onDone={() => void onAdDone()} />}
    </div>
  );
}

/** Quảng cáo mô phỏng: đếm ngược 5 giây rồi trả thưởng */
function AdModal({ onDone }: { onDone: () => void }) {
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return (
    <div className="overlay">
      <div className="overlay__panel ad-panel">
        <div className="ad-panel__video">
          <span>📺</span>
          <p>Quảng cáo mô phỏng…</p>
        </div>
        {remaining > 0 ? (
          <div className="ad-panel__countdown">Nhận thưởng sau {remaining}s</div>
        ) : (
          <button className="btn btn--primary btn--big" onClick={onDone}>
            Nhận 🍠
          </button>
        )}
      </div>
    </div>
  );
}
