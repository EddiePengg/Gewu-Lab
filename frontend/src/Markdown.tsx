import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathDelimiters } from "./mathDelimiters";
import { remarkVideo } from "./video";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkVideo]} rehypePlugins={[rehypeKatex]}>
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  );
}
