import { useEffect, useRef, useState } from "react";
import { Bot, Check, Send, Settings2, Square } from "lucide-react";
import { API_URL, authorizedFetch } from "./api";

const PROMPT_KEY = "gewu-ai-system-prompt";

interface Props {
  selection: string;
  getDocument: () => string;
  onApply: (markdown: string) => void;
}

export function CopilotSidebar({ selection, getDocument, onApply }: Props) {
  const [instruction, setInstruction] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(PROMPT_KEY) || "");
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController>(null);

  useEffect(() => {
    localStorage.setItem(PROMPT_KEY, systemPrompt);
  }, [systemPrompt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    const value = instruction.trim();
    if (!value || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult("");
    setError("");
    try {
      const response = await authorizedFetch(`${API_URL}/ai/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: getDocument(),
          selection,
          instruction: value,
          system_prompt: systemPrompt.trim(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "AI 请求失败");
      }
      if (!response.body) throw new Error("AI 返回了空响应");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        const text = decoder.decode(chunk, { stream: true });
        if (text) setResult((previous) => previous + text);
      }
      const finalChunk = decoder.decode();
      if (finalChunk) setResult((previous) => previous + finalChunk);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "AI 请求失败");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  return (
    <aside className="copilot-sidebar" aria-label="AI 副驾驶">
      <div className="copilot-heading">
        <Bot size={19} />
        <div>
          <h2>AI 副驾驶</h2>
          <p>改写选区，或在光标处插入内容</p>
        </div>
      </div>

      <div className={`copilot-selection${selection ? " has-selection" : ""}`}>
        <span>{selection ? "当前选区" : "当前操作位置"}</span>
        {selection ? <pre>{selection}</pre> : <p>未选择内容，将在编辑器光标处插入。</p>}
      </div>

      <label className="copilot-label" htmlFor="copilot-instruction">你想让 AI 做什么？</label>
      <textarea
        id="copilot-instruction"
        className="copilot-instruction"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void run();
          }
        }}
        placeholder={selection ? "例如：把选区改得更简洁，保留公式" : "例如：补充一个因式分解例题"}
        rows={5}
      />
      <div className="copilot-actions">
        <button type="button" className="primary-button" onClick={() => void run()} disabled={running || !instruction.trim()}>
          <Send size={15} />{running ? "正在生成…" : "发送"}
        </button>
        {running && <button type="button" className="secondary-button" onClick={() => abortRef.current?.abort()}><Square size={13} />停止</button>}
      </div>
      <p className="copilot-shortcut">⌘/Ctrl + Enter 发送，确认结果后再应用到编辑器</p>

      {error && <div className="inline-error copilot-error">{error}</div>}
      {result && (
        <div className="copilot-result">
          <span>生成结果</span>
          <pre>{result}</pre>
          <button
            type="button"
            className="primary-button"
            disabled={running}
            onClick={() => {
              onApply(result);
              setResult("");
              setInstruction("");
            }}
          >
            <Check size={15} />{selection ? "替换选区" : "插入到光标"}
          </button>
        </div>
      )}

      <details className="copilot-settings">
        <summary><Settings2 size={14} />提示词设置</summary>
        <label htmlFor="copilot-system-prompt">附加系统提示词</label>
        <textarea
          id="copilot-system-prompt"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          placeholder="例如：始终使用中文，解释时先给结论，再给出步骤。"
          rows={5}
        />
        <p>自动保存在此浏览器，并随每次请求发送。</p>
      </details>
    </aside>
  );
}
