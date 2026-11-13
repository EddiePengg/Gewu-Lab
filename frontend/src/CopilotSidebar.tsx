import { useEffect, useRef, useState } from "react";
import { Bot, Check, MessageSquarePlus, PanelRightClose, PanelRightOpen, Send, Settings2, Square } from "lucide-react";
import { API_URL, authorizedFetch } from "./api";
import { Markdown } from "./Markdown";

const PROMPT_KEY = "gewu-ai-system-prompt";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  selection: string;
  getDocument: () => string;
  onApply: (markdown: string) => void;
}

export function CopilotSidebar({ selection, getDocument, onApply }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(PROMPT_KEY) || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController>(null);
  const nextIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(PROMPT_KEY, systemPrompt);
  }, [systemPrompt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  async function run() {
    const value = instruction.trim();
    if (!value || running) return;
    const userMessage: ChatMessage = { id: ++nextIdRef.current, role: "user", content: value };
    const assistantId = ++nextIdRef.current;
    const history = [...messages, userMessage].slice(-40);
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((previous) => [...previous, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInstruction("");
    setRunning(true);
    setError("");
    try {
      const response = await authorizedFetch(`${API_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: getDocument(),
          selection,
          messages: history.map(({ role, content }) => ({ role, content })),
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
        if (text) {
          setMessages((previous) => previous.map((message) => message.id === assistantId
            ? { ...message, content: message.content + text }
            : message));
        }
      }
      const finalChunk = decoder.decode();
      if (finalChunk) {
        setMessages((previous) => previous.map((message) => message.id === assistantId
          ? { ...message, content: message.content + finalChunk }
          : message));
      }
    } catch (reason) {
      setMessages((previous) => previous.filter((message) => message.id !== assistantId || Boolean(message.content)));
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "AI 请求失败");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  if (collapsed) {
    return (
      <div className="copilot-collapsed-rail">
        <button type="button" title="展开 AI 副驾驶" aria-label="展开 AI 副驾驶" onClick={() => setCollapsed(false)}><PanelRightOpen size={18} /><span>AI</span></button>
      </div>
    );
  }

  return (
    <aside className="copilot-sidebar" aria-label="AI 副驾驶">
      <div className="copilot-heading">
        <Bot size={19} />
        <div>
          <h2>AI 副驾驶</h2>
          <p>围绕当前卡片提问和讨论</p>
        </div>
        <div className="copilot-heading-actions">
          <button
            type="button"
            title="清空对话"
            aria-label="清空对话"
            disabled={!messages.length || running}
            onClick={() => { setMessages([]); setError(""); }}
          ><MessageSquarePlus size={16} /></button>
          <button type="button" title="收起右侧栏" aria-label="收起右侧栏" onClick={() => setCollapsed(true)}><PanelRightClose size={17} /></button>
        </div>
      </div>

      <div className={`copilot-selection${selection ? " has-selection" : ""}`}>
        <span>{selection ? "已选内容会随消息发送" : "当前卡片会作为聊天上下文"}</span>
        {selection && <pre>{selection}</pre>}
      </div>

      <div className="copilot-messages" ref={messagesRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="copilot-empty">
            <Bot size={25} />
            <h3>一起理解这张卡片</h3>
            <p>可以提问、检查思路或讨论改写方式，不会直接修改卡片。</p>
            <button type="button" onClick={() => setInstruction("讲解这张卡片的主要内容")}>讲解这张卡片</button>
            <button type="button" onClick={() => setInstruction("检查这张卡片是否有知识性错误")}>检查解题思路</button>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={`copilot-message ${message.role}`}>
            <span className="copilot-message-role">{message.role === "user" ? "你" : "AI"}</span>
            <div className="copilot-message-content">
              {message.role === "user" ? <p>{message.content}</p> : message.content ? <Markdown>{message.content}</Markdown> : <span className="copilot-thinking">正在思考…</span>}
            </div>
            {message.role === "assistant" && message.content && (
              <button
                type="button"
                className="copilot-apply"
                disabled={running}
                onClick={() => onApply(message.content)}
              ><Check size={13} />{selection ? "用这条回答替换选区" : "将这条回答插入卡片"}</button>
            )}
          </div>
        ))}
      </div>

      {error && <div className="inline-error copilot-error">{error}</div>}
      <div className="copilot-composer">
        <textarea
          id="copilot-instruction"
          className="copilot-instruction"
          aria-label="给 AI 副驾驶发消息"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder="提问或继续追问…"
          rows={3}
        />
        <div className="copilot-composer-footer">
          <span>Enter 发送，Shift + Enter 换行</span>
          {running ? (
            <button type="button" className="secondary-button" onClick={() => abortRef.current?.abort()}><Square size={13} />停止</button>
          ) : (
            <button type="button" className="primary-button" onClick={() => void run()} disabled={!instruction.trim()}><Send size={14} />发送</button>
          )}
        </div>
      </div>

      <details className="copilot-settings">
        <summary><Settings2 size={14} />提示词设置</summary>
        <label htmlFor="copilot-system-prompt">附加系统提示词</label>
        <textarea
          id="copilot-system-prompt"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          placeholder="例如：始终使用中文，解释时先给结论，再给出步骤。"
          rows={4}
        />
        <p>自动保存在此浏览器，并随每次请求发送。</p>
      </details>
    </aside>
  );
}
