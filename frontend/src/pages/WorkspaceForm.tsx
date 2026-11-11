import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Shapes } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";

const colors = ["#6575d8", "#c56f4a", "#328675", "#9267a8", "#c39435", "#50788f"];

export function WorkspaceForm() {
  const { workspaces, refreshWorkspaces } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const first = workspaces.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const workspace = await api.createWorkspace({ name, description, color });
      await refreshWorkspaces();
      navigate(`/w/${workspace.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-form-page">
      {!first && <Link to="/" className="back-link"><ArrowLeft size={16} />返回学习空间</Link>}
      <div className="workspace-form-intro">
        <span className="eyebrow"><Shapes size={15} />YOUR SPACE</span>
        <h1>{first ? "从一个学习空间开始" : "创建新的 Workspace"}</h1>
        <p>{first ? "不必先规划完整的知识体系。一个空间，就是你当下愿意持续探索的一件事。" : "让不同的学习主题拥有独立的内容、标签与节奏。"}</p>
      </div>
      <form className="workspace-form" onSubmit={submit}>
        <label>空间名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：数学探索、物理笔记、数据可视化" maxLength={80} /></label>
        <label>空间描述 <span className="optional">可选</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这个空间用来做什么？" rows={3} maxLength={500} /></label>
        <fieldset><legend>识别颜色</legend><div className="color-options">{colors.map((option) => <button key={option} type="button" aria-label={`选择颜色 ${option}`} className={color === option ? "selected" : ""} style={{ background: option }} onClick={() => setColor(option)} />)}</div></fieldset>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={saving || !name.trim()}>{saving ? "正在创建…" : "创建 Workspace"}<ArrowRight size={17} /></button>
      </form>
    </div>
  );
}
