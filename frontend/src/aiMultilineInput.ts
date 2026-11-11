const PLACEHOLDER = "输入指令，Enter 换行，⌘/Ctrl+Enter 发送，可粘贴图片…";

function resize(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}

export function setupAIMultilineInput(root: HTMLElement) {
  const enhanced = new WeakMap<HTMLInputElement, HTMLTextAreaElement>();
  const cleanups = new Map<HTMLInputElement, () => void>();

  function syncFromOriginal(input: HTMLInputElement, focus = false) {
    const textarea = enhanced.get(input);
    if (!textarea) return;
    textarea.value = input.value;
    resize(textarea);
    if (focus) textarea.focus();
  }

  function enhance(input: HTMLInputElement) {
    if (enhanced.has(input)) return;
    const palette = input.closest(".milkdown-ai-instruction");
    const submit = palette?.querySelector<HTMLButtonElement>(".ai-instruction-submit");
    const list = palette?.querySelector<HTMLElement>(".ai-instruction-list");
    const textarea = document.createElement("textarea");
    textarea.className = `${input.className} ai-instruction-textarea`;
    textarea.placeholder = PLACEHOLDER;
    textarea.rows = 1;
    textarea.value = input.value;
    textarea.setAttribute("aria-label", "AI 指令");
    enhanced.set(input, textarea);

    function syncToOriginal() {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, textarea.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      resize(textarea);
    }

    function onKeydown(event: KeyboardEvent) {
      if (event.target !== textarea || event.key !== "Enter") return;
      event.stopImmediatePropagation();
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        syncToOriginal();
        requestAnimationFrame(() => submit?.click());
        return;
      }
      textarea.setRangeText("\n", textarea.selectionStart, textarea.selectionEnd, "end");
      syncToOriginal();
    }

    function clearAfterSubmit() {
      requestAnimationFrame(() => {
        textarea.value = "";
        resize(textarea);
      });
    }

    function syncAfterSelection() {
      requestAnimationFrame(() => syncFromOriginal(input));
    }

    textarea.addEventListener("input", syncToOriginal);
    root.addEventListener("keydown", onKeydown, true);
    submit?.addEventListener("click", clearAfterSubmit);
    list?.addEventListener("click", syncAfterSelection);
    input.parentElement?.insertBefore(textarea, input);
    input.style.display = "none";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    resize(textarea);

    cleanups.set(input, () => {
      textarea.removeEventListener("input", syncToOriginal);
      root.removeEventListener("keydown", onKeydown, true);
      submit?.removeEventListener("click", clearAfterSubmit);
      list?.removeEventListener("click", syncAfterSelection);
      textarea.remove();
    });
  }

  const observer = new MutationObserver((mutations) => {
    root.querySelectorAll<HTMLInputElement>("input.ai-instruction-input-field").forEach(enhance);
    for (const mutation of mutations) {
      const palette = mutation.target as HTMLElement;
      if (palette.classList?.contains("milkdown-ai-instruction") && palette.dataset.show === "true") {
        const input = palette.querySelector<HTMLInputElement>("input.ai-instruction-input-field");
        if (input) requestAnimationFrame(() => syncFromOriginal(input, true));
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-show"] });
  root.querySelectorAll<HTMLInputElement>("input.ai-instruction-input-field").forEach(enhance);

  return {
    destroy: () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    },
  };
}
