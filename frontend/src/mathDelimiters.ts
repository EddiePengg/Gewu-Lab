function precedingBackslashes(source: string, index: number) {
  let count = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i--) count++;
  return count;
}

function findClosingDelimiter(source: string, from: number, delimiter: string) {
  let index = source.indexOf(delimiter, from);
  while (index !== -1) {
    if (precedingBackslashes(source, index) % 2 === 0) return index;
    index = source.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

export function normalizeMathDelimiters(source: string) {
  let output = "";
  let index = 0;
  let lineStart = true;
  let fence: { marker: string; length: number } | null = null;

  while (index < source.length) {
    if (lineStart) {
      const match = source.slice(index).match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (match) {
        const lineEnd = source.indexOf("\n", index);
        const end = lineEnd === -1 ? source.length : lineEnd + 1;
        const marker = match[1][0];
        const length = match[1].length;
        const rest = source.slice(index + match[0].length, end);
        if (!fence) {
          fence = { marker, length };
        } else if (fence.marker === marker && length >= fence.length && /^[ \t]*(?:\n|$)/.test(rest)) {
          fence = null;
        }
        output += source.slice(index, end);
        index = end;
        continue;
      }
      lineStart = false;
    }

    if (!fence && source[index] === "`") {
      let length = 1;
      while (source[index + length] === "`") length++;
      const marker = "`".repeat(length);
      let closing = source.indexOf(marker, index + length);
      while (closing !== -1 && source[closing + length] === "`") {
        closing = source.indexOf(marker, closing + length + 1);
      }
      if (closing !== -1) {
        const end = closing + length;
        output += source.slice(index, end);
        index = end;
        continue;
      }
    }

    if (!fence && source[index] === "\\" && precedingBackslashes(source, index) % 2 === 0) {
      const display = source[index + 1] === "[";
      const inline = source[index + 1] === "(";
      if (display || inline) {
        const closingDelimiter = display ? "\\]" : "\\)";
        const closing = findClosingDelimiter(source, index + 2, closingDelimiter);
        if (closing !== -1) {
          const delimiter = display ? "$$" : "$";
          output += delimiter + source.slice(index + 2, closing) + delimiter;
          index = closing + 2;
          continue;
        }
      }
    }

    output += source[index];
    lineStart = source[index] === "\n";
    index++;
  }

  return output;
}
