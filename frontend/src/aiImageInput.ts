import { setupAIMultilineInput } from "./aiMultilineInput";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

export function setupAIImageInput(root: HTMLElement, onError: (message: string) => void) {
  const multilineInput = setupAIMultilineInput(root);
  let pendingImage: string | null = null;

  function clearAttachment() {
    pendingImage = null;
    root.querySelector(".ai-image-attachment")?.remove();
  }

  function showAttachment(palette: Element, dataUrl: string) {
    root.querySelector(".ai-image-attachment")?.remove();
    const chip = document.createElement("div");
    chip.className = "ai-image-attachment";
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = "待识别图片";
    const label = document.createElement("span");
    label.textContent = "已附加图片";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.ariaLabel = "移除图片";
    remove.textContent = "×";
    remove.addEventListener("click", clearAttachment);
    chip.append(image, label, remove);
    palette.querySelector(".ai-instruction")?.prepend(chip);
  }

  async function attach(file: File, palette: Element) {
    try {
      if (!IMAGE_TYPES.includes(file.type)) throw new Error("仅支持 PNG、JPEG 和 WebP 图片");
      if (file.size > MAX_IMAGE_SIZE) throw new Error("图片不能超过 10 MB");
      const dataUrl = await fileAsDataUrl(file);
      pendingImage = dataUrl;
      showAttachment(palette, dataUrl);
      const input = palette.querySelector<HTMLInputElement | HTMLTextAreaElement>(".ai-instruction-input-field:not([aria-hidden='true'])");
      if (input && !input.value.trim()) {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        setter?.call(input, "识别图片并转换为 Markdown 和 LaTeX");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "图片读取失败");
    }
  }

  function imageFrom(items: FileList | null) {
    return Array.from(items || []).find((file) => file.type.startsWith("image/"));
  }

  function onPaste(event: ClipboardEvent) {
    const target = event.target as HTMLElement | null;
    const palette = target?.closest(".milkdown-ai-instruction");
    if (!palette || !root.contains(palette)) return;
    const file = imageFrom(event.clipboardData?.files || null);
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void attach(file, palette);
  }

  function onDragOver(event: DragEvent) {
    const target = event.target as HTMLElement | null;
    const palette = target?.closest(".milkdown-ai-instruction");
    if (!palette || !root.contains(palette) || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
  }

  function onDrop(event: DragEvent) {
    const target = event.target as HTMLElement | null;
    const palette = target?.closest(".milkdown-ai-instruction");
    if (!palette || !root.contains(palette)) return;
    const file = imageFrom(event.dataTransfer?.files || null);
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void attach(file, palette);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const element = mutation.target as HTMLElement;
      if (element.classList?.contains("milkdown-ai-instruction") && element.dataset.show === "false") {
        clearAttachment();
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-show"] });
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("drop", onDrop, true);

  return {
    consumeImage: () => {
      const image = pendingImage;
      clearAttachment();
      return image;
    },
    destroy: () => {
      clearAttachment();
      multilineInput.destroy();
      observer.disconnect();
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
    },
  };
}
