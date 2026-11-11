import { useEffect, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Markdown } from "../Markdown";
import type { Card } from "../types";
import { formatDate, markdownPreview } from "../utils";

export function WorkspacePage() {
  const { workspaceId } = useParams();
  const id = Number(workspaceId);
  const { workspaces, loading: workspacesLoading } = useApp();
  const workspace = workspaces.find((item) => item.id === id);
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.listCards(id, query)
        .then((result) => { setCards(result); setError(""); })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败"))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [id, query]);

  if (!workspacesLoading && !workspace) return <div className="empty-state"><h1>没有找到这个 Workspace</h1><Link to="/">返回首页</Link></div>;
  if (!workspace) return <div className="page-loading">正在打开学习空间…</div>;

  return (
    <div className="workspace-page page-container">
      <header className="workspace-header">
        <div>
          <div className="workspace-kicker"><span style={{ background: workspace.color }} />WORKSPACE</div>
          <h1>{workspace.name}</h1>
          <p>{workspace.description || "在这里沉淀知识、记录问题，也保留思考的痕迹。"}</p>
        </div>
        <Link to={`/w/${id}/new`} className="primary-button"><Plus size={17} />新建卡片</Link>
      </header>

      <section className="library-section">
        <div className="library-toolbar">
          <div className="library-heading">全部卡片<span>{workspace.card_count}</span></div>
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Markdown 或标签" /></label>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {loading ? <div className="page-loading">正在检索卡片…</div> : cards.length === 0 ? (
          <div className="empty-state compact">
            <span className="empty-illustration"><BookOpen size={30} /></span>
            <h2>{query ? "没有找到匹配的卡片" : "让第一张卡片在这里生长"}</h2>
            <p>{query ? "试试其他关键词。" : "一个标题、一段理解、一道题，都可以从同一份 Markdown 开始。"}</p>
            {!query && <Link to={`/w/${id}/new`} className="primary-button"><Plus size={16} />新建卡片</Link>}
          </div>
        ) : (
          <div className="card-grid">
            {cards.map((card) => (
              <Link to={`/cards/${card.id}`} className="card-item" key={card.id}>
                <div className="card-preview"><Markdown>{markdownPreview(card.content)}</Markdown></div>
                <div className="card-footer">
                  <div className="tag-list">{card.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                  <time>更新于 {formatDate(card.updated_at)}</time>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
