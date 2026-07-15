import { useState } from 'react';
import { errorLabel } from '../lib/api';
import { useAuth } from '../store/auth';

interface Props {
  onDone: () => void;
  onLogin: () => void;
}

export function Register({ onDone, onLogin }: Props) {
  const register = useAuth((s) => s.register);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('cg:displayName') ?? '',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(email.trim(), password, displayName.trim());
      onDone();
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <h1>Đăng ký</h1>
      <p className="auth-note">Tài khoản mới được tặng 🍠 1.000 củ</p>
      <form className="home__form" onSubmit={(e) => void submit(e)}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Tên hiển thị"
          maxLength={20}
          autoFocus
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu (từ 6 ký tự)"
          minLength={6}
          required
        />
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--big" disabled={busy}>
          {busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </button>
        <div className="auth-links">
          <button type="button" className="link" onClick={onLogin}>
            Đã có tài khoản? Đăng nhập
          </button>
          <button type="button" className="link" onClick={onDone}>
            ← Quay lại
          </button>
        </div>
      </form>
    </div>
  );
}
