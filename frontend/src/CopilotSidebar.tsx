import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, CornerDownLeft, MessageSquarePlus, PanelRightClose, PanelRightOpen, Send, Settings2, Square, Undo2 } from "lucide-react";
import { API_URL, authorizedFetch } from "./api";
import { Markdown } from "./Markdown";

const PROMPT_KEY = "gewu-ai-system-prompt";

type CopilotMode = "ask" | "agent";

interface AgentEdit {
  before: string;
  after: string;
  applied: boolean;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  agentEdit?: AgentEdit;
  undone?: boolean;
}

interface Props {
  selection: string;
  getDocument: () => string;
  onInsert: (markdown: string) => void;
  onReplace: (markdown: string) => string;
}

function parseAgentResponse(source: string) {
  const match = source.trim().match(/^<summary>([\s\S]*?)<\/summary>\s*<document>\n?([\s\S]*?)\n?<\/document>$/);
  if (!match) throw new Error("Agent 返回的内容不完整，当前文档未修改");
  return {
    summary: match[1].trim() || "已按要求修改当前文档。",
    document: match[2],
  };
}

export function CopilotSidebar({ selection, getDocument, onInsert, onReplace }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<CopilotMode>("ask");
  const [instruction, setInstruction] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(PROMPT_KEY) || "");
  const [conversations, setConversations] = useState<Record<CopilotMode, ChatMessage[]>>({ ask: [], agent: [] });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const abortRef = useRef<AbortController>(null);
  const copyResetRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messages = conversations[mode];

  useEffect(() => {
    localStorage.setItem(PROMPT_KEY, systemPrompt);
  }, [systemPrompt]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, mode]);

  function updateMessages(targetMode: CopilotMode, update: (current: ChatMessage[]) => ChatMessage[]) {
    setConversations((previous) => ({ ...previous, [targetMode]: update(previous[targetMode]) }));
  }

  function updateMessage(targetMode: CopilotMode, id: number, update: (message: ChatMessage) => ChatMessage) {
    updateMessages(targetMode, (current) => current.map((message) => message.id === id ? update(message) : message));
  }

  async function copyMarkdown(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopiedId(null), 1600);
      setError("");
    } catch {
      setError("复制失败，请检查浏览器的剪贴板权限。");
    }
  }

  function insertAnswer(message: ChatMessage) {
    if (!selection) {
      onInsert(message.content);
      setError("");
      return;
    }
    const document = getDocument();
    const start = document.indexOf(selection);
    if (start === -1) {
      setError("无法在原始文档中定位当前选区，请重新选择后再试。");
      return;
    }
    onReplace(document.slice(0, start) + message.content + document.slice(start + selection.length));
    setError("");
  }

  function applyPendingEdit(message: ChatMessage) {
    if (!message.agentEdit) return;
    const after = onReplace(message.agentEdit.after);
    updateMessage(mode, message.id, (current) => ({
      ...current,
      undone: false,
      agentEdit: current.agentEdit ? { ...current.agentEdit, after, applied: true } : undefined,
    }));
    setError("");
  }

  function undoEdit(message: ChatMessage) {
    const edit = message.agentEdit;
    if (!edit?.applied) return;
    if (getDocument() !== edit.after) {
      setError("文档在此次修改后又有变化，为避免覆盖新内容，请使用编辑器的撤销功能。");
      return;
    }
    onReplace(edit.before);
    updateMessage(mode, message.id, (current) => ({
      ...current,
      undone: true,
      agentEdit: current.agentEdit ? { ...current.agentEdit, applied: false } : undefined,
    }));
    setError("");
  }

  async function run() {
    const value = instruction.trim();
    if (!value || running) return;
    const runMode = mode;
    const document = getDocument();
    const userMessage: ChatMessage = { id: ++nextIdRef.current, role: "user", content: value };
    const assistantId = ++nextIdRef.current;
    const history = [...messages, userMessage].slice(-40);
    const controller = new AbortController();
    abortRef.current = controller;
    updateMessages(runMode, (current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInstruction("");
    setRunning(true);
    setError("");
    try {
      const response = await authorizedFetch(`${API_URL}/ai/${runMode === "agent" ? "agent" : "chat"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document,
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
      let rawResponse = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        const text = decoder.decode(chunk, { stream: true });
        if (!text) continue;
        rawResponse += text;
        if (runMode === "ask") {
          updateMessage(runMode, assistantId, (message) => ({ ...message, content: message.content + text }));
        }
      }
      const finalChunk = decoder.decode();
      if (finalChunk) {
        rawResponse += finalChunk;
        if (runMode === "ask") updateMessage(runMode, assistantId, (message) => ({ ...message, content: message.content + finalChunk }));
      }
      if (runMode === "agent") {
        const result = parseAgentResponse(rawResponse);
        const currentDocument = getDocument();
        if (result.document === document) {
          updateMessage(runMode, assistantId, (message) => ({ ...message, content: `${result.summary}\n\n文档无需修改。` }));
        } else if (currentDocument !== document) {
          updateMessage(runMode, assistantId, (message) => ({
            ...message,
            content: `${result.summary}\n\n生成期间文档又有改动，为避免覆盖，请确认后手动应用。`,
            agentEdit: { before: document, after: result.document, applied: false },
          }));
        } else {
          const after = onReplace(result.document);
          updateMessage(runMode, assistantId, (message) => ({
            ...message,
            content: result.summary,
            agentEdit: { before: document, after, applied: true },
          }));
        }
      }
    } catch (reason) {
      updateMessages(runMode, (current) => current.filter((message) => message.id !== assistantId || Boolean(message.content)));
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
          <p>{mode === "ask" ? "围绕当前卡片提问和讨论" : "理解要求并直接编辑当前卡片"}</p>
        </div>
        <div className="copilot-heading-actions">
          <button
            type="button"
            title="清空当前对话"
            aria-label="清空当前对话"
            disabled={!messages.length || running}
            onClick={() => { updateMessages(mode, () => []); setError(""); }}
          ><MessageSquarePlus size={16} /></button>
          <button type="button" title="收起右侧栏" aria-label="收起右侧栏" onClick={() => setCollapsed(true)}><PanelRightClose size={17} /></button>
        </div>
      </div>

      <div className="copilot-mode-tabs" role="tablist" aria-label="AI 工作模式">
        <button type="button" role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "active" : ""} disabled={running} onClick={() => { setMode("ask"); setError(""); }}>询问</button>
        <button type="button" role="tab" aria-selected={mode === "agent"} className={mode === "agent" ? "active" : ""} disabled={running} onClick={() => { setMode("agent"); setError(""); }}>Agent</button>
      </div>

      <div className={`copilot-selection${selection ? " has-selection" : ""}`}>
        <span>{selection
          ? mode === "agent" ? "Agent 将只修改选区，保留其余内容" : "已选内容会随消息发送"
          : mode === "agent" ? "Agent 可直接修改当前整个文档" : "当前卡片会作为聊天上下文"}</span>
        {selection && <pre>{selection}</pre>}
      </div>

      <div className="copilot-messages" ref={messagesRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="copilot-empty">
            <Bot size={25} />
            <h3>{mode === "ask" ? "一起理解这张卡片" : "让 Agent 编辑这张卡片"}</h3>
            <p>{mode === "ask" ? "提问和讨论不会自动修改卡片，可复制原始 Markdown 或手动插入。" : "描述修改目标，Agent 会直接编辑文档；每次修改都可以撤销。"}</p>
            {mode === "ask" ? (
              <>
                <button type="button" onClick={() => setInstruction("讲解这张卡片的主要内容")}>讲解这张卡片</button>
                <button type="button" onClick={() => setInstruction("检查这张卡片是否有知识性错误")}>检查解题思路</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setInstruction("检查并修正这张卡片中的知识性错误，保持原有结构")}>修正知识性错误</button>
                <button type="button" onClick={() => setInstruction("优化全文表达和 Markdown 排版，不改变原有含义")}>优化全文表达与排版</button>
              </>
            )}
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={`copilot-message ${message.role}`}>
            <span className="copilot-message-role">{message.role === "user" ? "你" : mode === "agent" ? "Agent" : "AI"}</span>
            <div className="copilot-message-content">
              {message.role === "user" ? <p>{message.content}</p> : message.content ? <Markdown>{message.content}</Markdown> : <span className="copilot-thinking">{mode === "agent" ? "正在编辑文档…" : "正在思考…"}</span>}
            </div>
            {mode === "ask" && message.role === "assistant" && message.content && (
              <div className="copilot-message-actions">
                <button type="button" disabled={running} onMouseDown={(event) => event.preventDefault()} onClick={() => void copyMarkdown(message)}>
                  {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                  {copiedId === message.id ? "已复制" : "复制 Markdown"}
                </button>
                <button type="button" disabled={running} onMouseDown={(event) => event.preventDefault()} onClick={() => insertAnswer(message)}>
                  <CornerDownLeft size={13} />{selection ? "替换选区" : "插入到光标"}
                </button>
              </div>
            )}
            {message.agentEdit && (
              <div className="copilot-agent-status">
                {message.agentEdit.applied ? (
                  <>
                    <span><Check size={13} />已修改文档</span>
                    <button type="button" disabled={running} onClick={() => undoEdit(message)}><Undo2 size={13} />撤销此次修改</button>
                  </>
                ) : message.undone ? (
                  <span className="copilot-undone"><Undo2 size={13} />已撤销此次修改</span>
                ) : (
                  <button type="button" disabled={running} onClick={() => applyPendingEdit(message)}><Check size={13} />应用修改</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="inline-error copilot-error">{error}</div>}
      <div className="copilot-composer">
        <textarea
          id="copilot-instruction"
          className="copilot-instruction"
          aria-label={mode === "agent" ? "告诉 Agent 如何修改文档" : "给 AI 副驾驶发消息"}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder={mode === "agent" ? "描述要怎样修改当前文档…" : "提问或继续追问…"}
          rows={3}
        />
        <div className="copilot-composer-footer">
          <span>Enter 发送，Shift + Enter 换行</span>
          {running ? (
            <button type="button" className="secondary-button" onClick={() => abortRef.current?.abort()}><Square size={13} />停止</button>
          ) : (
            <button type="button" className="primary-button" onClick={() => void run()} disabled={!instruction.trim()}><Send size={14} />{mode === "agent" ? "执行" : "发送"}</button>
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
