import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, Eye, SquarePen, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { MarkdownEditor } from "../MarkdownEditor";
import type { Card } from "../types";
import { parseTags } from "../utils";

export function CardPage() {
  const { cardId } = useParams();
  const id = Number(cardId);
  const { workspaces, refreshWorkspaces } = useApp();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.viewCard(id).then((result) => {
      setCard(result);
      setContent(result.content);
      setTags(result.tags.join(", "));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败"));
  }, [id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!card || !content.trim() || content.trim() === "#") return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateCard(card.id, { content, tags: parseTags(tags) });
      setCard(updated);
      setContent(updated.content);
      setTags(updated.tags.join(", "));
      await refreshWorkspaces();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!card || !window.confirm("确定删除这张卡片吗？此操作无法撤销。")) return;
    try {
      await api.deleteCard(card.id);
      await refreshWorkspaces();
      navigate(`/w/${card.workspace_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  }

  if (error && !card) return <div className="empty-state"><h1>无法打开卡片</h1><p>{error}</p><Link to="/">返回首页</Link></div>;
  if (!card) return <div className="page-loading">正在翻开这一页…</div>;
  const workspace = workspaces.find((item) => item.id === card.workspace_id);

  return (
    <form className="editor-page" onSubmit={save}>
      <header className="editor-topbar">
        <Link to={`/w/${card.workspace_id}`} className="back-link"><ArrowLeft size={16} />{workspace?.name || "返回 Workspace"}</Link>
        <div className="editor-mode"><SquarePen size={16} />编辑卡片</div>
        <div className="editor-actions">
          <button type="button" className="secondary-button danger" onClick={() => void remove()}><Trash2 size={15} />删除</button>
          <button className="primary-button" disabled={saving || !content.trim() || content.trim() === "#"}><Check size={16} />{saving ? "保存中…" : "保存"}</button>
        </div>
      </header>
      {error && <div className="inline-error editor-error">{error}</div>}
      <div className="wysiwyg-workspace">
        <MarkdownEditor key={card.id} value={content} onChange={setContent} onError={setError} />
      </div>
      <footer className="card-editor-footer">
        <div className="card-metadata">
          <span><CalendarDays size={14} />创建于 {new Date(card.created_at).toLocaleString("zh-CN")}</span>
          <span>修改于 {new Date(card.updated_at).toLocaleString("zh-CN")}</span>
          {card.last_viewed_at && <span><Eye size={14} />上次查看 {new Date(card.last_viewed_at).toLocaleString("zh-CN")}</span>}
        </div>
        <label className="editor-label" htmlFor="detail-tags">标签<span>使用逗号分隔，最多 12 个</span></label>
        <input id="detail-tags" className="tags-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="微积分, 导数, 待复习" />
      </footer>
    </form>
  );
}
