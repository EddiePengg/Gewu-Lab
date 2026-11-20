import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { Node } from "unist";

type MarkdownNode = Node & {
  value?: string;
  src?: string;
  children?: Node[];
};

export function videoMarkdown(src: string) {
  return `<video src="${src}" controls playsinline></video>`;
}

function videoSource(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^<video\b[^>]*\bsrc="([^"]+)"[^>]*>(?:<\/video>)?$/);
  return match?.[1];
}

export function remarkVideo() {
  function createVideo(src: string): MarkdownNode {
    return {
      type: "video",
      src,
      data: {
        hName: "video",
        hProperties: { src, controls: true, playsInline: true, preload: "metadata" },
      },
    };
  }

  function transform(node: MarkdownNode) {
    if (!node.children) return;
    node.children = node.children.map((item) => {
      const child = item as MarkdownNode;
      const directSource = child.type === "html" ? videoSource(child.value) : undefined;
      if (directSource) return createVideo(directSource);

      if (child.type === "paragraph" && child.children?.length === 2) {
        const [opening, closing] = child.children as MarkdownNode[];
        const src = opening.type === "html" ? videoSource(opening.value) : undefined;
        if (src && closing.type === "html" && closing.value?.trim() === "</video>") return createVideo(src);
      }

      transform(child);
      return child;
    });
  }
  return (tree: MarkdownNode) => transform(tree);
}

export const remarkVideoPlugin = $remark("video", () => remarkVideo);

export const videoSchema = $nodeSchema("video", () => ({
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    src: { default: "", validate: "string" },
  },
  parseDOM: [{
    tag: "video[src]",
    getAttrs: (dom) => ({ src: (dom as HTMLElement).getAttribute("src") ?? "" }),
  }],
  toDOM: (node) => {
    const video = document.createElement("video");
    video.src = node.attrs.src;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    return video;
  },
  parseMarkdown: {
    match: (node) => node.type === "video",
    runner: (state, node, type) => {
      state.addNode(type, { src: node.src as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "video",
    runner: (state, node) => {
      state.addNode("html", undefined, videoMarkdown(node.attrs.src));
    },
  },
}));
