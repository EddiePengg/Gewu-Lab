import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { authenticate } from "../api";

interface Props {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: Props) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      await authenticate(token.trim());
      onLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.svg" className="brand-mark" alt="格物 Lab" />
        <div className="eyebrow">PERSONAL KNOWLEDGE LAB</div>
        <h1>回到格物 Lab</h1>
        <p>输入服务器环境变量 GEWU_API_TOKEN 的值。网页和 AI 使用同一个 Token，Token 会保存在当前浏览器中。</p>
        <label htmlFor="api-token">Bearer Token</label>
        <input
          id="api-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="输入 GEWU_API_TOKEN"
          autoComplete="current-password"
          autoFocus
        />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading || !token.trim()}>
          <KeyRound size={16} />{loading ? "验证中…" : "进入格物 Lab"}
        </button>
      </form>
    </main>
  );
}
