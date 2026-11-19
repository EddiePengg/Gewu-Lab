import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, SquarePen } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { CopilotSidebar } from "../CopilotSidebar";
import { MarkdownEditor, type MarkdownEditorHandle } from "../MarkdownEditor";
import { normalizeMathDelimiters } from "../mathDelimiters";
import { UnsavedChangesGuard } from "../UnsavedChangesGuard";
import { parseTags } from "../utils";

export function CardEditor() {
  const { workspaceId, cardId } = useParams();
  const navigate = useNavigate();
  const { refreshWorkspaces } = useApp();
  const editing = Boolean(cardId);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState(Number(workspaceId));
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [tags, setTags] = useState("");
  const [savedTags, setSavedTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState("");
  const [aiSelection, setAISelection] = useState("");
  const editorRef = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    if (!cardId) return;
    api.getCard(Number(cardId)).then((card) => {
      const nextTags = card.tags.join(", ");
      setResolvedWorkspaceId(card.workspace_id);
      setContent(card.content);
      setSavedContent(card.content);
      setTags(nextTags);
      setSavedTags(nextTags);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false));
  }, [cardId]);

  async function persist(navigateAfterSave = true) {
    const currentContent = editorRef.current?.getMarkdown() ?? content;
    if (!currentContent.trim() || currentContent.trim() === "#") return false;
    setSaving(true);
    setError("");
    const input = { content: currentContent, tags: parseTags(tags) };
    try {
      const card = editing
        ? await api.updateCard(Number(cardId), input)
        : await api.createCard(resolvedWorkspaceId, input);
      const nextTags = card.tags.join(", ");
      setContent(card.content);
      setSavedContent(card.content);
      setTags(nextTags);
      setSavedTags(nextTags);
      await refreshWorkspaces();
      if (navigateAfterSave) navigate(`/cards/${card.id}`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void persist();
  }

  if (loading) return <div className="page-loading">正在打开编辑器…</div>;
  const backPath = editing ? `/cards/${cardId}` : `/w/${resolvedWorkspaceId}`;
  const contentChanged = normalizeMathDelimiters(content) !== normalizeMathDelimiters(savedContent);
  const dirty = (editing
    ? contentChanged
    : Boolean(content.trim() && content.trim() !== "#" && contentChanged)) || tags !== savedTags;

  return (
    <form
      className="editor-page"
      onSubmit={submit}
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (!saving) event.currentTarget.requestSubmit();
        }
      }}
    >
      <UnsavedChangesGuard when={dirty && !saving} onSave={() => persist(false)} />
      <header className="editor-topbar">
        <Link to={backPath} className="back-link"><ArrowLeft size={16} />取消</Link>
        <div className="editor-mode"><SquarePen size={16} />{editing ? "编辑卡片" : "新建卡片"}</div>
        <button className="primary-button" disabled={saving || !content.trim() || content.trim() === "#"}><Check size={16} />{saving ? "保存中…" : "保存"}</button>
      </header>
      {error && <div className="inline-error editor-error">{error}</div>}
      <div className="editor-body">
        <div className="editor-document">
          <div className="wysiwyg-workspace">
            <MarkdownEditor
              ref={editorRef}
              key={cardId || workspaceId}
              value={content}
              onChange={setContent}
              onError={setError}
              onSelectionChange={setAISelection}
            />
          </div>
          <footer className="card-editor-footer">
            <label className="editor-label" htmlFor="tags">标签<span>使用逗号分隔，最多 12 个</span></label>
            <input id="tags" className="tags-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="微积分, 导数, 待复习" />
          </footer>
        </div>
        <CopilotSidebar
          selection={aiSelection}
          getDocument={() => editorRef.current?.getMarkdown() ?? content}
          onInsert={(markdown) => editorRef.current?.insertMarkdown(markdown)}
          onReplace={(markdown) => editorRef.current?.replaceDocument(markdown) ?? markdown}
        />
      </div>
    </form>
  );
}
