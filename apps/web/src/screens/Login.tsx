import { useState } from 'react';
import { errorLabel } from '../lib/api';
import { useAuth } from '../store/auth';

interface Props {
  onDone: () => void;
  onRegister: () => void;
}

export function Login({ onDone, onRegister }: Props) {
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      onDone();
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <h1>Đăng nhập</h1>
      <form className="home__form" onSubmit={(e) => void submit(e)}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoFocus
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          required
        />
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--big" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <div className="auth-links">
          <button type="button" className="link" onClick={onRegister}>
            Chưa có tài khoản? Đăng ký
          </button>
          <button type="button" className="link" onClick={onDone}>
            ← Quay lại
          </button>
        </div>
      </form>
    </div>
  );
}
