import { normalizeMathDelimiters } from "./mathDelimiters";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

export function markdownPreview(source: string, lineCount = 6) {
  const lines = normalizeMathDelimiters(source).trim().split("\n");
  let preview = lines.slice(0, lineCount).join("\n");
  if ((preview.match(/^```/gm) || []).length % 2 !== 0) preview += "\n```";
  if ((preview.match(/^\$\$\s*$/gm) || []).length % 2 !== 0) preview += "\n$$";
  if (lines.length > lineCount) preview += "\n\n…";
  return preview || "# 未命名卡片";
}

export function parseTags(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)));
}
