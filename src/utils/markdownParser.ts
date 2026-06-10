/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocElement, HeadingMapping } from "../types";

/**
 * Removes standard markdown markup like bold (**), italic (*), code blocks (`) and links [text](url)
 * to make the text clean for insertion into Google Docs, and extracts link positions.
 */
function stripMarkdownFormatting(text: string): {
  cleaned: string;
  links: { startIndex: number; endIndex: number; url: string }[];
  boldRanges: { startIndex: number; endIndex: number }[];
  italicRanges: { startIndex: number; endIndex: number }[];
  underlineRanges: { startIndex: number; endIndex: number }[];
  strikethroughRanges: { startIndex: number; endIndex: number }[];
} {
  let cleaned = text;

  const boldRanges: { startIndex: number; endIndex: number }[] = [];
  const italicRanges: { startIndex: number; endIndex: number }[] = [];
  const underlineRanges: { startIndex: number; endIndex: number }[] = [];
  const strikethroughRanges: { startIndex: number; endIndex: number }[] = [];
  const links: { startIndex: number; endIndex: number; url: string }[] = [];

  const doReplace = (
    regex: RegExp,
    onMatch: (
      match: RegExpExecArray,
      startIndex: number,
    ) => {
      replacement: string;
      prefixLen: number;
      newRanges: { type: string; start: number; end: number; data?: any }[];
    },
  ) => {
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      const startIndex = match.index;
      const { replacement, prefixLen, newRanges } = onMatch(match, startIndex);
      const lengthDiff = replacement.length - match[0].length;

      cleaned =
        cleaned.slice(0, startIndex) +
        replacement +
        cleaned.slice(startIndex + match[0].length);

      const updateRange = (r: { startIndex: number; endIndex: number }) => {
        const updateVal = (idx: number): number => {
          if (idx <= startIndex) return idx;
          if (idx >= startIndex + match[0].length) return idx + lengthDiff;
          if (idx <= startIndex + prefixLen) return startIndex;
          if (idx >= startIndex + prefixLen + replacement.length) return startIndex + replacement.length;
          return idx - prefixLen;
        };
        r.startIndex = updateVal(r.startIndex);
        r.endIndex = updateVal(r.endIndex);
      };

      links.forEach(updateRange);
      boldRanges.forEach(updateRange);
      italicRanges.forEach(updateRange);
      underlineRanges.forEach(updateRange);
      strikethroughRanges.forEach(updateRange);

      newRanges.forEach((r) => {
        if (r.type === "link")
          links.push({ startIndex: r.start, endIndex: r.end, url: r.data });
        if (r.type === "bold")
          boldRanges.push({ startIndex: r.start, endIndex: r.end });
        if (r.type === "italic")
          italicRanges.push({ startIndex: r.start, endIndex: r.end });
        if (r.type === "underline")
          underlineRanges.push({ startIndex: r.start, endIndex: r.end });
        if (r.type === "strikethrough")
          strikethroughRanges.push({ startIndex: r.start, endIndex: r.end });
      });

      regex.lastIndex = startIndex + replacement.length;
    }
  };

  // Links
  doReplace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, start) => {
    return {
      replacement: match[1],
      prefixLen: 1,
      newRanges: [
        { type: "link", start, end: start + match[1].length, data: match[2] },
      ],
    };
  });

  // bold italic ***text***
  doReplace(/(\*\*\*)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      prefixLen: 3,
      newRanges: [
        { type: "bold", start, end: start + textLen },
        { type: "italic", start, end: start + textLen },
      ],
    };
  });

  // bold **text**
  doReplace(/(\*\*)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      prefixLen: 2,
      newRanges: [{ type: "bold", start, end: start + textLen }],
    };
  });

  // underline __text__
  doReplace(/(__)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      prefixLen: 2,
      newRanges: [{ type: "underline", start, end: start + textLen }],
    };
  });

  // italic *text* or _text_
  doReplace(/(\*|_)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      prefixLen: 1,
      newRanges: [{ type: "italic", start, end: start + textLen }],
    };
  });

  // strikethrough ~~text~~
  doReplace(/~~(.*?)~~/g, (match, start) => {
    const textLen = match[1].length;
    return {
      replacement: match[1],
      prefixLen: 2,
      newRanges: [{ type: "strikethrough", start, end: start + textLen }],
    };
  });

  // inline code `text` -> text
  doReplace(/`([^`]+)`/g, (match, start) => {
    return {
      replacement: match[1],
      prefixLen: 1,
      newRanges: [],
    };
  });

  const leadingSpacesMatch = cleaned.match(/^\s+/);
  const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[0].length : 0;

  if (leadingSpaces > 0) {
    const shiftRange = (r: { startIndex: number; endIndex: number }) => {
      r.startIndex = Math.max(0, r.startIndex - leadingSpaces);
      r.endIndex = Math.max(0, r.endIndex - leadingSpaces);
    };
    links.forEach(shiftRange);
    boldRanges.forEach(shiftRange);
    italicRanges.forEach(shiftRange);
    underlineRanges.forEach(shiftRange);
    strikethroughRanges.forEach(shiftRange);
  }

  const trimmed = cleaned.trim();
  const capRange = (r: { startIndex: number; endIndex: number }) => {
    r.startIndex = Math.min(r.startIndex, trimmed.length);
    r.endIndex = Math.min(r.endIndex, trimmed.length);
  };
  links.forEach(capRange);
  boldRanges.forEach(capRange);
  italicRanges.forEach(capRange);
  underlineRanges.forEach(capRange);
  strikethroughRanges.forEach(capRange);

  // Return signature addition
  return {
    cleaned: trimmed,
    links,
    boldRanges,
    italicRanges,
    underlineRanges,
    strikethroughRanges,
  };
}

export function parseMarkdown(
  markdown: string,
  defaultName: string = "Untitled Blog Post",
  headingMapping?: HeadingMapping,
): { title: string; elements: DocElement[] } {
  const lines = markdown.split(/\r?\n/);

  let extractedTitle = "";
  const parsedLines: Array<{
    raw: string;
    text: string;
    rawType:
      | "title"
      | "heading1"
      | "heading2"
      | "text"
      | "bullet_list"
      | "numbered_list"
      | "horizontal_rule"
      | "code_block"
      | "table";
    tableRows?: string[][];
    links: { startIndex: number; endIndex: number; url: string }[];
    boldRanges: { startIndex: number; endIndex: number }[];
    italicRanges: { startIndex: number; endIndex: number }[];
    underlineRanges: { startIndex: number; endIndex: number }[];
    strikethroughRanges: { startIndex: number; endIndex: number }[];
  }> = [];

  let inFrontmatter = false;
  let hasParsedTitle = false;

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  let inTable = false;
  let tableRows: string[][] = [];

  const getHeadingType = (
    poundString: string,
  ): "title" | "heading1" | "heading2" | null => {
    if (
      !headingMapping ||
      !headingMapping.title ||
      !headingMapping.heading1 ||
      !headingMapping.heading2
    ) {
      if (poundString === "#") return "title";
      if (poundString === "##") return "heading1";
      return "heading2"; // fallback
    }
    if (headingMapping.title === poundString && !hasParsedTitle) return "title";
    if (headingMapping.heading1 === poundString) return "heading1";
    if (headingMapping.heading2 === poundString) return "heading2";
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmedLine = originalLine.trim();

    // Parse Code blocks
    if (trimmedLine.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        codeBlockLines.push(originalLine);
        parsedLines.push({
          raw: codeBlockLines.join("\n"),
          text: codeBlockLines.join("\n"),
          rawType: "code_block",
          links: [],
          boldRanges: [],
          italicRanges: [],
          underlineRanges: [],
          strikethroughRanges: [],
        });
        codeBlockLines = [];
        continue;
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLines.push(originalLine);
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(originalLine);
      continue;
    }

    // Parse Frontmatter if exists
    if (trimmedLine === "---") {
      if (!inFrontmatter && i === 0) {
        inFrontmatter = true;
        continue;
      } else if (inFrontmatter) {
        inFrontmatter = false;
        continue;
      }
    }

    // Match Table Row
    const isTableRow = trimmedLine.startsWith("|") && trimmedLine.endsWith("|");
    if (isTableRow) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const isSeparator = /^\|[ \-:]+\|([ \-:]+\|)*$/.test(trimmedLine);
      if (!isSeparator) {
        const cells = trimmedLine
          .slice(1, -1)
          .split("|")
          .map((c) => {
            const { cleaned } = stripMarkdownFormatting(c.trim());
            return cleaned;
          });
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      inTable = false;
      if (tableRows.length > 0) {
        parsedLines.push({
          raw: "",
          text: "",
          rawType: "table",
          tableRows: tableRows,
          links: [],
          boldRanges: [],
          italicRanges: [],
          underlineRanges: [],
          strikethroughRanges: [],
        });
      }
      tableRows = [];
    }

    // Match HR (---, ***, ___)
    if (/^[-*_]{3,}\s*$/.test(trimmedLine)) {
      parsedLines.push({
        raw: originalLine,
        text: "__________________________________________________",
        rawType: "horizontal_rule",
        links: [],
        boldRanges: [],
        italicRanges: [],
        underlineRanges: [],
        strikethroughRanges: [],
      });
      continue;
    }

    if (inFrontmatter) {
      const match = trimmedLine.match(/^title:\s*(.*)$/i);
      if (match) {
        extractedTitle = match[1].replace(/['"]/g, "").trim();
      }
      continue;
    }

    // Skip empty lines in layout structure mapping, but they count to end elements
    if (trimmedLine === "") {
      continue;
    }

    // Match Headers
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const {
        cleaned: content,
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      } = stripMarkdownFormatting(headingMatch[2]);
      const headingType = getHeadingType(headingMatch[1]);

      if (headingType === "title") {
        if (!extractedTitle && !hasParsedTitle) {
          extractedTitle = content;
          hasParsedTitle = true;
          parsedLines.push({
            raw: originalLine,
            text: content,
            rawType: "title",
            links,
            boldRanges,
            italicRanges,
            underlineRanges,
            strikethroughRanges,
          });
        } else {
          // fallback to heading1 if title already consumed
          parsedLines.push({
            raw: originalLine,
            text: content,
            rawType: "heading1",
            links,
            boldRanges,
            italicRanges,
            underlineRanges,
            strikethroughRanges,
          });
        }
      } else if (headingType === "heading1") {
        parsedLines.push({
          raw: originalLine,
          text: content,
          rawType: "heading1",
          links,
          boldRanges,
          italicRanges,
          underlineRanges,
          strikethroughRanges,
        });
      } else if (headingType === "heading2") {
        parsedLines.push({
          raw: originalLine,
          text: content,
          rawType: "heading2",
          links,
          boldRanges,
          italicRanges,
          underlineRanges,
          strikethroughRanges,
        });
      } else {
        // Fallback or unmapped heading, treat as generic text or heading2 for backward compatibility
        parsedLines.push({
          raw: originalLine,
          text: content,
          rawType: "heading2",
          links,
          boldRanges,
          italicRanges,
          underlineRanges,
          strikethroughRanges,
        });
      }
      continue;
    }

    // Match Bullet List (- item, * item, + item)
    const bulletMatch = trimmedLine.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const {
        cleaned: content,
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      } = stripMarkdownFormatting(bulletMatch[1]);
      parsedLines.push({
        raw: originalLine,
        text: content,
        rawType: "bullet_list",
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      });
      continue;
    }

    // Match Numbered List (1. item, 2. item)
    const numberedMatch = trimmedLine.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      const {
        cleaned: content,
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      } = stripMarkdownFormatting(numberedMatch[1]);
      parsedLines.push({
        raw: originalLine,
        text: content,
        rawType: "numbered_list",
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      });
      continue;
    }

    // Default: normal text paragraph
    const {
      cleaned: content,
      links,
      boldRanges,
      italicRanges,
      underlineRanges,
      strikethroughRanges,
    } = stripMarkdownFormatting(originalLine);
    if (content) {
      parsedLines.push({
        raw: originalLine,
        text: content,
        rawType: "text",
        links,
        boldRanges,
        italicRanges,
        underlineRanges,
        strikethroughRanges,
      });
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    parsedLines.push({
      raw: codeBlockLines.join("\n"),
      text: codeBlockLines.join("\n"),
      rawType: "code_block",
      links: [],
      boldRanges: [],
      italicRanges: [],
      underlineRanges: [],
      strikethroughRanges: [],
    });
  }

  // Handle unclosed table
  if (inTable && tableRows.length > 0) {
    parsedLines.push({
      raw: "",
      text: "",
      rawType: "table",
      tableRows: tableRows,
      links: [],
      boldRanges: [],
      italicRanges: [],
      underlineRanges: [],
      strikethroughRanges: [],
    });
  }

  // If we couldn't find a title, let's look for the first title-type line or fallback to defaultName
  if (!extractedTitle) {
    const firstTitleLine = parsedLines.find((l) => l.rawType === "title");
    if (firstTitleLine) {
      extractedTitle = firstTitleLine.text;
    } else {
      extractedTitle = defaultName.replace(/\.md$/i, "");
    }
  }

  // Convert elements and identify the last bullet point in contiguous list segments
  const finalElements: DocElement[] = [];

  for (let idx = 0; idx < parsedLines.length; idx++) {
    const current = parsedLines[idx];
    const formatting = {
      links: current.links,
      boldRanges: current.boldRanges,
      italicRanges: current.italicRanges,
      underlineRanges: current.underlineRanges,
      strikethroughRanges: current.strikethroughRanges,
    };

    if (current.rawType === "title") {
      finalElements.push({
        text: current.text,
        type: "title",
        ...formatting,
      });
    } else if (current.rawType === "heading1") {
      finalElements.push({
        text: current.text,
        type: "heading1",
        ...formatting,
      });
    } else if (current.rawType === "heading2") {
      finalElements.push({
        text: current.text,
        type: "heading2",
        ...formatting,
      });
    } else if (current.rawType === "horizontal_rule") {
      finalElements.push({
        text: " ",
        type: "horizontal_rule",
        ...formatting,
      });
    } else if (current.rawType === "text") {
      finalElements.push({
        text: current.text,
        type: "text",
        ...formatting,
      });
    } else if (current.rawType === "code_block") {
      finalElements.push({
        text: current.text,
        type: "code_block",
        ...formatting,
      });
    } else if (current.rawType === "table") {
      finalElements.push({
        text: current.text,
        type: "table",
        tableRows: current.tableRows,
        ...formatting,
      });
    } else if (
      current.rawType === "bullet_list" ||
      current.rawType === "numbered_list"
    ) {
      const isBulleted = current.rawType === "bullet_list";

      // Look ahead to check if this is the last list item of this type in a contiguous block
      let isLast = true;
      let nextIdx = idx + 1;

      // If there's a subsequent line, and it is a list item of the same type, then this is not the last
      if (nextIdx < parsedLines.length) {
        const next = parsedLines[nextIdx];
        if (next.rawType === current.rawType) {
          isLast = false;
        }
      }

      finalElements.push({
        text: current.text,
        type: "list_item",
        bulleted: isBulleted,
        isLastInList: isLast,
        ...formatting,
      });
    }
  }

  return {
    title: extractedTitle,
    elements: finalElements,
  };
}
