import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { Crepe } from "@milkdown/crepe";
import { Video } from "lucide-react";
import { editorViewCtx, inputRulesCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $inputRule, $prose, insert, replaceAll } from "@milkdown/kit/utils";
import { API_URL, authorizedFetch } from "./api";
import { normalizeMathDelimiters } from "./mathDelimiters";
import { remarkVideoPlugin, videoMarkdown, videoSchema } from "./video";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
  onSelectionChange: (selection: string) => void;
}

export interface MarkdownEditorHandle {
  getMarkdown: () => string | undefined;
  insertMarkdown: (markdown: string) => void;
  replaceDocument: (markdown: string) => string | undefined;
}

async function uploadAsset(file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await authorizedFetch(`${API_URL}/assets`, { method: "POST", body });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(result?.detail || "附件上传失败");
  }
  return (await response.json() as { url: string }).url;
}

const inlineMathInput = $inputRule((ctx) => {
  const rule = new InputRule(
    /(?:\$\$([^\s$](?:[^$]*[^\s$])?)\$\$|(?<!\$)\$([^\s$](?:[^$]*[^\s$])?)\$)$/,
    (state, match, start, end) => {
      const value = match[1] ?? match[2];
      if (!value) return null;
      const node = ctx.get(schemaCtx).nodes.math_inline.create({ value });
      return state.tr.replaceRangeWith(start, end, node);
    },
  );
  ctx.update(inputRulesCtx, (rules) => rules.filter((item) => (item as InputRule & { match: RegExp }).match.source !== String.raw`\$([^\s$](?:[^$]*[^\s$])?)\$$`));
  return rule;
});

const emptyHeadingBackspace = $prose(() => keymap({
  Backspace: (state, dispatch) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const { $from } = selection;
    if ($from.parentOffset !== 0 || $from.parent.type.name !== "heading" || $from.parent.content.size !== 0) return false;

    const from = $from.before();
    if ($from.depth === 1 && state.doc.childCount === 1) {
      dispatch?.(state.tr.setNodeMarkup(from, state.schema.nodes.paragraph));
    } else {
      dispatch?.(state.tr.delete(from, $from.after()));
    }
    return true;
  },
}));

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor({ value, onChange, onError, onSelectionChange }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onChangeRef.current = onChange;
  onErrorRef.current = onError;
  onSelectionChangeRef.current = onSelectionChange;
  useImperativeHandle(ref, () => ({
    getMarkdown: () => crepeRef.current?.getMarkdown(),
    insertMarkdown: (markdown) => {
      crepeRef.current?.editor.action(insert(normalizeMathDelimiters(markdown)));
    },
    replaceDocument: (markdown) => {
      crepeRef.current?.editor.action(replaceAll(normalizeMathDelimiters(markdown)));
      return crepeRef.current?.getMarkdown();
    },
  }), []);

  async function handleVideoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !crepeRef.current) return;
    if (file.size > 200 * 1024 * 1024) {
      onErrorRef.current("视频不能超过 200 MB");
      return;
    }
    setUploadingVideo(true);
    onErrorRef.current("");
    try {
      const url = await uploadAsset(file);
      crepeRef.current?.editor.action(insert(videoMarkdown(url)));
    } catch (reason) {
      onErrorRef.current(reason instanceof Error ? reason.message : "视频上传失败");
    } finally {
      setUploadingVideo(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (event.clipboardData.getData("text/html")) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const normalized = normalizeMathDelimiters(text);
    if (normalized === text || !crepeRef.current) return;
    event.preventDefault();
    crepeRef.current.editor.action(insert(normalized));
  }

  useEffect(() => {
    if (!rootRef.current) return;
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: normalizeMathDelimiters(value),
      features: {
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: { onUpload: uploadAsset },
        [Crepe.Feature.Placeholder]: { text: "开始书写，使用 / 插入内容", mode: "block" },
        [Crepe.Feature.BlockEdit]: { advancedGroup: { label: "高级", math: { label: "数学公式" } } },
        [Crepe.Feature.Latex]: { katexOptions: { throwOnError: false } },
      },
    });
    const selectionTracker = $prose((ctx) => new Plugin({
      view: () => {
        let previousSelection: string | undefined;
        const notify = () => {
          const { state } = ctx.get(editorViewCtx);
          let selection = "";
          if (!state.selection.empty) {
            const { from, to } = state.selection;
            const slice = state.doc.slice(from, to);
            const { schema } = state.doc.type;
            let wrapper = schema.topNodeType.createAndFill(null, slice.content);
            if (!wrapper) {
              const paragraph = schema.nodes.paragraph?.createAndFill(null, slice.content);
              if (paragraph) wrapper = schema.topNodeType.createAndFill(null, paragraph);
            }
            selection = wrapper ? ctx.get(serializerCtx)(wrapper) : state.doc.textBetween(from, to);
          }
          if (selection === previousSelection) return;
          previousSelection = selection;
          onSelectionChangeRef.current(selection);
        };
        return {
          update: (view, prevState) => {
            if (!view.state.selection.eq(prevState.selection) || view.state.doc !== prevState.doc) notify();
          },
        };
      },
    }));
    crepeRef.current = crepe;
    crepe.editor.use(remarkVideoPlugin).use(videoSchema).use(emptyHeadingBackspace).use(selectionTracker).use(inlineMathInput);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) onChangeRef.current(markdown);
      });
    });
    crepe.create().catch((error) => onErrorRef.current(error instanceof Error ? error.message : "编辑器初始化失败"));
    return () => {
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, []);

  return (
    <>
      <div className="editor-media-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={uploadingVideo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => videoInputRef.current?.click()}
        >
          <Video size={15} />{uploadingVideo ? "视频上传中…" : "上传 MP4 视频"}
        </button>
        <input ref={videoInputRef} type="file" accept="video/mp4,.mp4" onChange={(event) => void handleVideoUpload(event)} hidden />
      </div>
      <div className="milkdown-editor" ref={rootRef} onPasteCapture={handlePaste} />
    </>
  );
});
