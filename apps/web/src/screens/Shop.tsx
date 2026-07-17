import { useEffect, useState } from 'react';
import type {
  CoinPackage,
  CreateOrderResponse,
  PaymentProvider,
} from '@card-games/types';
import { api, errorLabel } from '../lib/api';
import { getAccessToken, useAuth } from '../store/auth';

export function Shop({ onBack }: { onBack: () => void }) {
  const balance = useAuth((s) => s.balance);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CoinPackage[]>('/shop/packages')
      .then(setPackages)
      .catch((err) => setError(errorLabel(err)));
  }, []);

  const buy = async (pkg: CoinPackage, provider: PaymentProvider) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api<CreateOrderResponse>('/shop/orders', {
        token: getAccessToken() ?? undefined,
        body: { packageId: pkg.id, provider },
      });
      if (res.status === 'paid' && res.balance !== undefined) {
        useAuth.setState({ balance: res.balance });
        setMessage(`✅ Đã nạp ${pkg.coins.toLocaleString('vi-VN')} củ 🍠`);
      } else if (res.payUrl) {
        window.location.href = res.payUrl; // sang trang thanh toán
      }
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Quay lại
        </button>
        <h2>💰 Nạp củ</h2>
        <span className="balance balance--chip">
          🍠 {balance.toLocaleString('vi-VN')}
        </span>
      </header>

      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}

      <div className="page__body">
        {packages.map((pkg) => (
          <div key={pkg.id} className="shop-card">
            <div className="shop-card__info">
              <div className="shop-card__coins">
                🍠 {pkg.coins.toLocaleString('vi-VN')} củ
              </div>
              <div className="shop-card__label">
                {pkg.label} · {pkg.priceVnd.toLocaleString('vi-VN')}₫
              </div>
            </div>
            <div className="shop-card__actions">
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void buy(pkg, 'momo')}
              >
                MoMo
              </button>
              <button className="btn" disabled={busy} onClick={() => void buy(pkg, 'stripe')}>
                Thẻ (Stripe)
              </button>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => void buy(pkg, 'dev')}
                title="Chỉ có ở môi trường dev"
              >
                🧪 Nạp thử
              </button>
            </div>
          </div>
        ))}
        <p className="section-note">
          Củ 🍠 chỉ dùng trong game, không quy đổi ngược thành tiền.
        </p>
      </div>
    </div>
  );
}
