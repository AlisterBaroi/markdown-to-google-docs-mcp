/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocElement } from '../types';

/**
 * Removes standard markdown markup like bold (**), italic (*), code blocks (`) and links [text](url)
 * to make the text clean for insertion into Google Docs, and extracts link positions.
 */
function stripMarkdownFormatting(text: string): { 
  cleaned: string; 
  links: { startIndex: number; endIndex: number; url: string }[];
  boldRanges: { startIndex: number; endIndex: number }[];
  italicRanges: { startIndex: number; endIndex: number }[];
  strikethroughRanges: { startIndex: number; endIndex: number }[];
} {
  let cleaned = text;

  const boldRanges: { startIndex: number; endIndex: number }[] = [];
  const italicRanges: { startIndex: number; endIndex: number }[] = [];
  const strikethroughRanges: { startIndex: number; endIndex: number }[] = [];
  const links: { startIndex: number; endIndex: number; url: string }[] = [];

  const doReplace = (
    regex: RegExp, 
    onMatch: (match: RegExpExecArray, startIndex: number) => { replacement: string, newRanges: { type: string, start: number, end: number, data?: any }[] }
  ) => {
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      const startIndex = match.index;
      const { replacement, newRanges } = onMatch(match, startIndex);
      const lengthDiff = replacement.length - match[0].length;
      
      cleaned = cleaned.slice(0, startIndex) + replacement + cleaned.slice(startIndex + match[0].length);
      
      const updateRange = (r: { startIndex: number; endIndex: number }) => {
        if (r.startIndex > startIndex) r.startIndex += lengthDiff;
        if (r.endIndex > startIndex) r.endIndex += lengthDiff;
      };
      
      links.forEach(updateRange);
      boldRanges.forEach(updateRange);
      italicRanges.forEach(updateRange);
      strikethroughRanges.forEach(updateRange);

      newRanges.forEach(r => {
        if (r.type === 'link') links.push({ startIndex: r.start, endIndex: r.end, url: r.data });
        if (r.type === 'bold') boldRanges.push({ startIndex: r.start, endIndex: r.end });
        if (r.type === 'italic') italicRanges.push({ startIndex: r.start, endIndex: r.end });
        if (r.type === 'strikethrough') strikethroughRanges.push({ startIndex: r.start, endIndex: r.end });
      });
      
      regex.lastIndex = startIndex + replacement.length;
    }
  };

  // Links
  doReplace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, start) => {
    return {
      replacement: match[1],
      newRanges: [{ type: 'link', start, end: start + match[1].length, data: match[2] }]
    };
  });

  // bold italic ***text*** or ___text___
  doReplace(/(\*\*\*|___)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      newRanges: [
        { type: 'bold', start, end: start + textLen },
        { type: 'italic', start, end: start + textLen }
      ]
    };
  });

  // bold **text** or __text__
  doReplace(/(\*\*|__)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      newRanges: [{ type: 'bold', start, end: start + textLen }]
    };
  });

  // italic *text* or _text_
  doReplace(/(\*|_)(.*?)\1/g, (match, start) => {
    const textLen = match[2].length;
    return {
      replacement: match[2],
      newRanges: [{ type: 'italic', start, end: start + textLen }]
    };
  });

  // strikethrough ~~text~~
  doReplace(/~~(.*?)~~/g, (match, start) => {
    const textLen = match[1].length;
    return {
      replacement: match[1],
      newRanges: [{ type: 'strikethrough', start, end: start + textLen }]
    };
  });

  // inline code `text` -> text
  doReplace(/`([^`]+)`/g, (match, start) => {
    return {
      replacement: match[1],
      newRanges: []
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
  strikethroughRanges.forEach(capRange);

  return { cleaned: trimmed, links, boldRanges, italicRanges, strikethroughRanges };
}

/**
 * Parses markdown text into DocElements with type tags
 */
export function parseMarkdown(markdown: string, defaultName: string = 'Untitled Blog Post'): { title: string; elements: DocElement[] } {
  const lines = markdown.split(/\r?\n/);
  
  let extractedTitle = '';
  const parsedLines: Array<{ 
    raw: string; 
    text: string; 
    rawType: 'title' | 'heading1' | 'text' | 'bullet_list' | 'numbered_list' | 'horizontal_rule' | 'code_block'; 
    links: { startIndex: number; endIndex: number; url: string }[];
    boldRanges: { startIndex: number; endIndex: number }[];
    italicRanges: { startIndex: number; endIndex: number }[];
    strikethroughRanges: { startIndex: number; endIndex: number }[];
  }> = [];
  
  let inFrontmatter = false;
  let hasParsedTitle = false;
  
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmedLine = originalLine.trim();

    // Parse Code blocks
    if (trimmedLine.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        codeBlockLines.push(originalLine);
        parsedLines.push({
          raw: codeBlockLines.join('\n'),
          text: codeBlockLines.join('\n'),
          rawType: 'code_block',
          links: [], boldRanges: [], italicRanges: [], strikethroughRanges: []
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
    if (trimmedLine === '---') {
      if (!inFrontmatter && i === 0) {
        inFrontmatter = true;
        continue;
      } else if (inFrontmatter) {
        inFrontmatter = false;
        continue;
      }
    }

    // Match HR (---, ***, ___)
    if (/^[-*_]{3,}\s*$/.test(trimmedLine)) {
      parsedLines.push({ 
        raw: originalLine, 
        text: '__________________________________________________', 
        rawType: 'horizontal_rule', 
        links: [], boldRanges: [], italicRanges: [], strikethroughRanges: [] 
      });
      continue;
    }

    if (inFrontmatter) {
      const match = trimmedLine.match(/^title:\s*(.*)$/i);
      if (match) {
        extractedTitle = match[1].replace(/['"]/g, '').trim();
      }
      continue;
    }

    // Skip empty lines in layout structure mapping, but they count to end elements
    if (trimmedLine === '') {
      continue;
    }

    // Match Header 1 (#)
    const h1Match = trimmedLine.match(/^#\s+(.*)$/);
    if (h1Match) {
      const { cleaned: content, links, boldRanges, italicRanges, strikethroughRanges } = stripMarkdownFormatting(h1Match[1]);
      if (!extractedTitle && !hasParsedTitle) {
        extractedTitle = content;
        hasParsedTitle = true;
        parsedLines.push({ raw: originalLine, text: content, rawType: 'title', links, boldRanges, italicRanges, strikethroughRanges });
      } else {
        parsedLines.push({ raw: originalLine, text: content, rawType: 'heading1', links, boldRanges, italicRanges, strikethroughRanges });
      }
      continue;
    }

    // Match other Headers (##, ###, etc.) -> all maps to heading1 style for this requirements
    const hNextMatch = trimmedLine.match(/^#{2,6}\s+(.*)$/);
    if (hNextMatch) {
      const { cleaned: content, links, boldRanges, italicRanges, strikethroughRanges } = stripMarkdownFormatting(hNextMatch[1]);
      parsedLines.push({ raw: originalLine, text: content, rawType: 'heading1', links, boldRanges, italicRanges, strikethroughRanges });
      continue;
    }

    // Match Bullet List (- item, * item, + item)
    const bulletMatch = trimmedLine.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const { cleaned: content, links, boldRanges, italicRanges, strikethroughRanges } = stripMarkdownFormatting(bulletMatch[1]);
      parsedLines.push({ raw: originalLine, text: content, rawType: 'bullet_list', links, boldRanges, italicRanges, strikethroughRanges });
      continue;
    }

    // Match Numbered List (1. item, 2. item)
    const numberedMatch = trimmedLine.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      const { cleaned: content, links, boldRanges, italicRanges, strikethroughRanges } = stripMarkdownFormatting(numberedMatch[1]);
      parsedLines.push({ raw: originalLine, text: content, rawType: 'numbered_list', links, boldRanges, italicRanges, strikethroughRanges });
      continue;
    }

    // Default: normal text paragraph
    const { cleaned: content, links, boldRanges, italicRanges, strikethroughRanges } = stripMarkdownFormatting(originalLine);
    if (content) {
      parsedLines.push({ raw: originalLine, text: content, rawType: 'text', links, boldRanges, italicRanges, strikethroughRanges });
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    parsedLines.push({
      raw: codeBlockLines.join('\n'),
      text: codeBlockLines.join('\n'),
      rawType: 'code_block',
      links: [], boldRanges: [], italicRanges: [], strikethroughRanges: []
    });
  }

  // If we couldn't find a title, let's look for the first title-type line or fallback to defaultName
  if (!extractedTitle) {
    const firstTitleLine = parsedLines.find(l => l.rawType === 'title');
    if (firstTitleLine) {
      extractedTitle = firstTitleLine.text;
    } else {
      extractedTitle = defaultName.replace(/\.md$/i, '');
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
      strikethroughRanges: current.strikethroughRanges
    };

    if (current.rawType === 'title') {
      finalElements.push({
        text: current.text,
        type: 'title',
        ...formatting
      });
    } else if (current.rawType === 'heading1') {
      finalElements.push({
        text: current.text,
        type: 'heading1',
        ...formatting
      });
    } else if (current.rawType === 'horizontal_rule') {
      finalElements.push({
        text: ' ',
        type: 'horizontal_rule',
        ...formatting
      });
    } else if (current.rawType === 'text') {
      finalElements.push({
        text: current.text,
        type: 'text',
        ...formatting
      });
    } else if (current.rawType === 'code_block') {
      finalElements.push({
        text: current.text,
        type: 'code_block',
        ...formatting
      });
    } else if (current.rawType === 'bullet_list' || current.rawType === 'numbered_list') {
      const isBulleted = current.rawType === 'bullet_list';
      
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
        type: 'list_item',
        bulleted: isBulleted,
        isLastInList: isLast,
        ...formatting
      });
    }
  }

  return {
    title: extractedTitle,
    elements: finalElements
  };
}
