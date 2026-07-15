import { useState } from 'react';
import { useGame } from '../store/game';
import { getUserId } from '../lib/socket';

export function Chat() {
  const chat = useGame((s) => s.chat);
  const sendChat = useGame((s) => s.sendChat);
  const [text, setText] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendChat(text);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat__messages">
        {chat.slice(-6).map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={`chat__msg ${m.userId === getUserId() ? 'chat__msg--mine' : ''}`}
          >
            <strong>{m.displayName}:</strong> {m.text}
          </div>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Chat…"
          maxLength={200}
        />
      </form>
    </div>
  );
}
