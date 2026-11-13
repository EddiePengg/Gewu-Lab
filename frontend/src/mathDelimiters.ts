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

function findMalformedDisplayClosing(source: string, from: number) {
  const pattern = /^[ \t]*\][ \t]*(?=\r?$)/gm;
  pattern.lastIndex = from;
  const match = pattern.exec(source);
  return match ? match.index + match[0].indexOf("]") : -1;
}

function findParenthesisClosing(source: string, from: number) {
  let depth = 0;
  for (let index = from; index < source.length; index++) {
    if (source[index] === "\n" || source[index] === "\r") return -1;
    if (source[index] === "\\") {
      index++;
      continue;
    }
    if (source[index] === "(") {
      depth++;
    } else if (source[index] === ")") {
      if (depth === 0) return index;
      depth--;
    }
  }
  return -1;
}

function hasLatexCommand(source: string) {
  return /\\(?:[a-zA-Z]+|[\s,;!])/.test(source);
}

function looksLikeAlgebra(source: string) {
  return /^[a-zA-Z0-9\s+\-*/=^_{}(),.;:[\]\\|<>!]+$/.test(source)
    && /[a-zA-Z]/.test(source)
    && /[+\-*/=^_{}]/.test(source);
}

function normalizeMathContent(source: string) {
  return source.replace(/^[ \t]*\\=[ \t]*/gm, "=");
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

    if (!fence && source[index] === "$" && precedingBackslashes(source, index) % 2 === 0) {
      const display = source[index + 1] === "$";
      const delimiter = display ? "$$" : "$";
      const contentStart = index + delimiter.length;
      const closing = findClosingDelimiter(source, contentStart, delimiter);
      if (closing > contentStart && (display || !source.slice(contentStart, closing).includes("\n"))) {
        const end = closing + delimiter.length;
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
        let closing = findClosingDelimiter(source, index + 2, closingDelimiter);
        let closingLength = 2;
        if (closing === -1 && display) {
          closing = findMalformedDisplayClosing(source, index + 2);
          closingLength = 1;
        } else if (closing === -1) {
          closing = findParenthesisClosing(source, index + 2);
          closingLength = 1;
        }
        if (closing !== -1) {
          const delimiter = display ? "$$" : "$";
          output += delimiter + normalizeMathContent(source.slice(index + 2, closing)) + delimiter;
          index = closing + closingLength;
          continue;
        }
      }
    }

    if (!fence && source[index] === "(" && precedingBackslashes(source, index) % 2 === 0) {
      const closing = findParenthesisClosing(source, index + 1);
      if (closing !== -1) {
        const content = source.slice(index + 1, closing);
        const doubleWrapped = source[index + 1] === "(" && source[closing - 1] === ")";
        if (hasLatexCommand(content) || (doubleWrapped && looksLikeAlgebra(content))) {
          output += "$" + normalizeMathContent(content) + "$";
          index = closing + 1;
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
