import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Eye, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Markdown } from "../Markdown";
import type { Card } from "../types";

export function CardPage() {
  const { cardId } = useParams();
  const id = Number(cardId);
  const { workspaces, refreshWorkspaces } = useApp();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.viewCard(id).then(setCard).catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败"));
  }, [id]);

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
    <article className="entry-page page-container narrow">
      <div className="entry-topbar">
        <Link to={`/w/${card.workspace_id}`} className="back-link"><ArrowLeft size={16} />{workspace?.name || "返回 Workspace"}</Link>
        <div className="entry-actions"><Link to={`/cards/${card.id}/edit`} className="secondary-button"><Pencil size={15} />编辑</Link><button className="icon-button danger" title="删除" onClick={() => void remove()}><Trash2 size={17} /></button></div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="card-metadata">
        <span><CalendarDays size={14} />创建于 {new Date(card.created_at).toLocaleString("zh-CN")}</span>
        <span>修改于 {new Date(card.updated_at).toLocaleString("zh-CN")}</span>
        {card.last_viewed_at && <span><Eye size={14} />上次查看 {new Date(card.last_viewed_at).toLocaleString("zh-CN")}</span>}
      </div>
      <Markdown>{card.content || "# 未命名卡片"}</Markdown>
      {card.tags.length > 0 && <footer className="card-detail-tags">{card.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</footer>}
    </article>
  );
}
