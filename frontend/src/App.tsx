import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { BookOpen, FlaskConical, LogOut, Plus } from "lucide-react";
import { api, clearApiToken, getApiToken } from "./api";
import type { Workspace } from "./types";
import { WorkspacePage } from "./pages/WorkspacePage";
import { CardEditor } from "./pages/CardEditor";
import { CardPage } from "./pages/CardPage";
import { WorkspaceForm } from "./pages/WorkspaceForm";
import { LoginPage } from "./pages/LoginPage";

interface AppContext {
  workspaces: Workspace[];
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
}

export function useApp() {
  return useOutletContext<AppContext>();
}

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshWorkspaces = useCallback(async () => {
    try {
      setWorkspaces(await api.listWorkspaces());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法连接服务");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="格物 Lab 首页">
          <img src="/logo.svg" className="brand-mark" alt="" />
          <span className="brand-name">格物 <b>Lab</b></span>
        </Link>
        <div className="sidebar-label"><span>学习空间</span><FlaskConical size={14} /></div>
        <nav className="workspace-nav">
          {workspaces.map((workspace) => (
            <NavLink
              key={workspace.id}
              to={`/w/${workspace.id}`}
              className={({ isActive }) => `workspace-link${isActive ? " active" : ""}`}
              title={workspace.name}
            >
              <span className="workspace-dot" style={{ background: workspace.color }} />
              <span className="workspace-link-name">{workspace.name}</span>
              <span className="workspace-total">{workspace.card_count}</span>
            </NavLink>
          ))}
        </nav>
        <Link to="/workspaces/new" className="new-workspace-link"><Plus size={16} /><span>新建 Workspace</span></Link>
        <div className="sidebar-footer">
          <BookOpen size={16} />
          <span>记录知识，也记录理解的过程。</span>
          <button className="logout-button" type="button" onClick={onLogout} title="退出登录" aria-label="退出登录"><LogOut size={15} /></button>
        </div>
      </aside>
      <main className="main-content">
        {error && <div className="global-error">{error}<button onClick={() => void refreshWorkspaces()}>重试</button></div>}
        <Outlet context={{ workspaces, loading, refreshWorkspaces }} />
      </main>
    </div>
  );
}

function Home() {
  const { workspaces, loading } = useApp();
  if (loading) return <div className="page-loading">正在整理你的学习空间…</div>;
  return workspaces.length
    ? <Navigate to={`/w/${workspaces[0].id}`} replace />
    : <Navigate to="/workspaces/new" replace />;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getApiToken()));

  useEffect(() => {
    const handleUnauthorized = () => setAuthenticated(false);
    window.addEventListener("gewu:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("gewu:unauthorized", handleUnauthorized);
  }, []);

  function logout() {
    clearApiToken();
    setAuthenticated(false);
  }

  return (
    <BrowserRouter>
      {authenticated ? (
        <Routes>
          <Route element={<AppShell onLogout={logout} />}>
            <Route path="/" element={<Home />} />
            <Route path="/workspaces/new" element={<WorkspaceForm />} />
            <Route path="/w/:workspaceId" element={<WorkspacePage />} />
            <Route path="/w/:workspaceId/new" element={<CardEditor />} />
            <Route path="/cards/:cardId" element={<CardPage />} />
            <Route path="/cards/:cardId/edit" element={<CardEditor />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      ) : <LoginPage onLogin={() => setAuthenticated(true)} />}
    </BrowserRouter>
  );
}
