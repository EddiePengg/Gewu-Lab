import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, inputRulesCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $inputRule, $prose, insert, replaceAll } from "@milkdown/kit/utils";
import { API_URL, authorizedFetch } from "./api";
import { normalizeMathDelimiters } from "./mathDelimiters";
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

async function uploadImage(file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await authorizedFetch(`${API_URL}/assets`, { method: "POST", body });
  if (!response.ok) throw new Error("图片上传失败");
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
  const crepeRef = useRef<Crepe>(null);
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

  useEffect(() => {
    if (!rootRef.current) return;
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: normalizeMathDelimiters(value),
      features: {
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: { onUpload: uploadImage },
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
    crepe.editor.use(emptyHeadingBackspace).use(selectionTracker).use(inlineMathInput);
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

  return <div className="milkdown-editor" ref={rootRef} />;
});
