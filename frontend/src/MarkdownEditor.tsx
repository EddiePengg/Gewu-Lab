import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { defaultAIIcon, useAIInstructionTooltipAPI } from "@milkdown/crepe/feature/ai";
import { editorViewCtx } from "@milkdown/kit/core";
import { setupAIImageInput } from "./aiImageInput";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}

async function uploadImage(file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_URL}/assets`, { method: "POST", body });
  if (!response.ok) throw new Error("图片上传失败");
  return (await response.json() as { url: string }).url;
}

export function MarkdownEditor({ value, onChange, onError }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!rootRef.current) return;
    const imageInput = setupAIImageInput(rootRef.current, (message) => onErrorRef.current(message));
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: value,
      features: {
        [Crepe.Feature.AI]: true,
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: { onUpload: uploadImage },
        [Crepe.Feature.Placeholder]: { text: "开始书写，使用 / 插入内容", mode: "block" },
        [Crepe.Feature.Latex]: { katexOptions: { throwOnError: false } },
        [Crepe.Feature.TopBar]: {
          buildTopBar: (builder) => {
            builder.addGroup("ai", "AI").addItem("ask-ai", {
              icon: defaultAIIcon,
              active: () => false,
              onRun: (ctx) => {
                const { from, to } = ctx.get(editorViewCtx).state.selection;
                useAIInstructionTooltipAPI(ctx).show(from, to);
              },
            });
          },
        },
        [Crepe.Feature.AI]: {
          provider: async function* (context, signal) {
            const image = imageInput.consumeImage();
            const response = await fetch(`${API_URL}/ai/edit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...context, image }),
              signal,
            });
            if (!response.ok) {
              const body = await response.json().catch(() => null);
              throw new Error(body?.detail || "AI 请求失败");
            }
            if (!response.body) throw new Error("AI 返回了空响应");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value: chunk } = await reader.read();
              if (done) break;
              yield decoder.decode(chunk, { stream: true });
            }
            const finalChunk = decoder.decode();
            if (finalChunk) yield finalChunk;
          },
          diffReviewOnEnd: true,
          instructionPlaceholder: "输入指令，或直接粘贴图片…",
          suggestionsHeaderLabel: "常用操作",
          sendAsPromptHeaderLabel: "自定义指令",
          sendAsPromptLabel: "询问 AI：",
          streamingIndicator: { fallbackLabel: "正在生成", cancelHint: "按 Esc 取消" },
          diffActions: {
            retryLabel: "重试",
            rejectAllLabel: "拒绝",
            acceptAllLabel: "接受",
          },
          onError: (error) => onErrorRef.current(error.message),
        },
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) onChangeRef.current(markdown);
      });
    });
    crepe.create().catch((error) => onErrorRef.current(error instanceof Error ? error.message : "编辑器初始化失败"));
    return () => {
      imageInput.destroy();
      void crepe.destroy();
    };
  }, []);

  return <div className="milkdown-editor" ref={rootRef} />;
}
