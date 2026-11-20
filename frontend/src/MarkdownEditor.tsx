import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, inputRulesCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $inputRule, $prose, insert, replaceAll } from "@milkdown/kit/utils";
import { API_URL, authorizedFetch } from "./api";
import { normalizeMathDelimiters } from "./mathDelimiters";
import { useMathSourceHidden } from "./mathVisibility";
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

const videoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;

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

const headingBackspace = $prose(() => keymap({
  Backspace: (state, dispatch) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const { $from } = selection;
    if ($from.parentOffset !== 0 || $from.parent.type.name !== "heading") return false;

    const from = $from.before();
    if ($from.parent.content.size === 0 && !($from.depth === 1 && state.doc.childCount === 1)) {
      dispatch?.(state.tr.delete(from, $from.after()));
    } else {
      dispatch?.(state.tr.setNodeMarkup(from, state.schema.nodes.paragraph));
    }
    return true;
  },
}));

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor({ value, onChange, onError, onSelectionChange }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const mathSourceHidden = useMathSourceHidden();
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
        [Crepe.Feature.BlockEdit]: {
          advancedGroup: { label: "高级", math: { label: "数学公式" } },
          buildMenu: (builder) => {
            builder.getGroup("advanced").addItem("video", {
              label: "视频",
              icon: videoIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                videoInputRef.current?.click();
              },
            });
          },
        },
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
    crepe.editor.use(remarkVideoPlugin).use(videoSchema).use(headingBackspace).use(selectionTracker).use(inlineMathInput);
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
      {uploadingVideo && <div className="editor-media-status" role="status">视频上传中…</div>}
      <input ref={videoInputRef} type="file" accept="video/mp4,.mp4" onChange={(event) => void handleVideoUpload(event)} hidden />
      <div className={`milkdown-editor${mathSourceHidden ? " math-source-hidden" : ""}`} ref={rootRef} onPasteCapture={handlePaste} />
    </>
  );
});
