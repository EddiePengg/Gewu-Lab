import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBeforeUnload, useBlocker } from "react-router-dom";

interface Props {
  when: boolean;
  onSave: () => Promise<boolean>;
}

export function UnsavedChangesGuard({ when, onSave }: Props) {
  const blocker = useBlocker(when);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useBeforeUnload(useCallback((event) => {
    if (!when) return;
    event.preventDefault();
    event.returnValue = "";
  }, [when]));

  useEffect(() => {
    if (blocker.state === "blocked") setError("");
  }, [blocker.state]);

  if (blocker.state !== "blocked") return null;

  async function saveAndExit() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (await onSave()) {
        blocker.proceed?.();
      } else {
        setError("内容未保存成功，请检查内容或网络后再试。你仍可以继续编辑或直接退出。");
      }
    } catch {
      setError("保存失败，请稍后重试。你仍可以继续编辑或直接退出。");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="unsaved-overlay">
      <div className="unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description">
        <h2 id="unsaved-title">有未保存的修改</h2>
        <p id="unsaved-description">现在退出会丢失这次编辑。你可以保存后离开，或继续留在当前页面。</p>
        {error && <div className="inline-error">{error}</div>}
        <div className="unsaved-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={() => blocker.reset?.()}>继续编辑</button>
          <button type="button" className="secondary-button unsaved-discard" disabled={saving} onClick={() => blocker.proceed?.()}>直接退出</button>
          <button type="button" className="primary-button" disabled={saving} onClick={() => void saveAndExit()}>{saving ? "保存中…" : "保存并退出"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
