/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/utils/markdownParser";

describe("parseMarkdown", () => {
  it("extracts the title from a leading # heading", () => {
    const { title, elements } = parseMarkdown("# Hello World\n\nSome text.");
    expect(title).toBe("Hello World");
    expect(elements[0]).toMatchObject({ type: "title", text: "Hello World" });
    expect(elements.some((e) => e.type === "text" && e.text === "Some text.")).toBe(true);
  });

  it("reads the title from frontmatter when present", () => {
    const { title } = parseMarkdown("---\ntitle: From Frontmatter\n---\n\nBody");
    expect(title).toBe("From Frontmatter");
  });

  it("parses bullet and numbered list items with the right bullet flag", () => {
    const { elements } = parseMarkdown("- one\n- two\n\n1. a\n2. b");
    const lists = elements.filter((e) => e.type === "list_item");
    expect(lists).toHaveLength(4);
    expect(lists[0]).toMatchObject({ bulleted: true });
    expect(lists[2]).toMatchObject({ bulleted: false });
  });

  it("parses a table into rows (excluding the separator)", () => {
    const { elements } = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const table = elements.find((e) => e.type === "table");
    expect(table).toBeTruthy();
    expect(table!.tableRows).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("keeps a non-mermaid fenced block as code_block, fences included", () => {
    const { elements } = parseMarkdown("```js\nconst x = 1;\n```");
    const code = elements.find((e) => e.type === "code_block");
    expect(code).toBeTruthy();
    expect(code!.text).toContain("const x = 1;");
    expect(code!.text).toContain("```");
  });

  it("extracts a ```mermaid block as a mermaid element with the fences stripped", () => {
    const md = "Intro\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\nOutro";
    const { elements } = parseMarkdown(md);

    const mermaid = elements.find((e) => e.type === "mermaid");
    expect(mermaid).toBeTruthy();
    expect(mermaid!.text).toBe("graph TD;\n  A-->B;");
    expect(mermaid!.text).not.toContain("```");

    // Surrounding prose is still parsed around the diagram.
    expect(elements.some((e) => e.type === "text" && e.text === "Intro")).toBe(true);
    expect(elements.some((e) => e.type === "text" && e.text === "Outro")).toBe(true);
  });

  it("handles multiple mermaid blocks independently", () => {
    const md = "```mermaid\ngraph LR; A-->B;\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```";
    const mermaids = parseMarkdown(md).elements.filter((e) => e.type === "mermaid");
    expect(mermaids).toHaveLength(2);
    expect(mermaids[0].text).toBe("graph LR; A-->B;");
    expect(mermaids[1].text).toContain("sequenceDiagram");
  });

  it("tolerates a frontmatter title with no value", () => {
    const { title } = parseMarkdown("---\ntitle:\n---\n\n# Fallback\n\nBody");
    expect(title).toBe("Fallback");
  });
});

// Functional coverage for the inline-formatting regexes (rewritten for CodeQL
// js/polynomial-redos): same cleaned text and ranges as before the rewrite.
describe("parseMarkdown inline formatting", () => {
  const textOf = (md: string) =>
    parseMarkdown(md).elements.find((e) => e.type === "text")!;

  it("extracts a link and strips the markup", () => {
    const el = textOf("See [docs](https://example.com) here");
    expect(el.text).toBe("See docs here");
    expect(el.links).toEqual([{ startIndex: 4, endIndex: 8, url: "https://example.com" }]);
  });

  it("leaves a link whose URL contains parens as literal text", () => {
    const el = textOf("[x](https://e.com/a(b)) end");
    expect(el.links ?? []).toEqual([]);
    expect(el.text).toContain("[x]");
  });

  it("strips bold and records the range", () => {
    const el = textOf("**bold** rest");
    expect(el.text).toBe("bold rest");
    expect(el.boldRanges).toEqual([{ startIndex: 0, endIndex: 4 }]);
  });

  it("allows a lone asterisk inside bold text", () => {
    const el = textOf("**a*b** x");
    expect(el.text).toBe("a*b x");
    expect(el.boldRanges).toEqual([{ startIndex: 0, endIndex: 3 }]);
  });

  it("marks ***text*** as both bold and italic", () => {
    const el = textOf("***bi*** x");
    expect(el.text).toBe("bi x");
    expect(el.boldRanges).toEqual([{ startIndex: 0, endIndex: 2 }]);
    expect(el.italicRanges).toEqual([{ startIndex: 0, endIndex: 2 }]);
  });

  it("handles italic via * and _ in the same line", () => {
    const el = textOf("*a* and _b_");
    expect(el.text).toBe("a and b");
    expect(el.italicRanges).toEqual([
      { startIndex: 0, endIndex: 1 },
      { startIndex: 6, endIndex: 7 },
    ]);
  });

  it("strips underline and strikethrough with ranges", () => {
    const el = textOf("__u__ and ~~s~~");
    expect(el.text).toBe("u and s");
    expect(el.underlineRanges).toEqual([{ startIndex: 0, endIndex: 1 }]);
    expect(el.strikethroughRanges).toEqual([{ startIndex: 6, endIndex: 7 }]);
  });

  it("combines link, bold, and italic on one line with correct offsets", () => {
    const el = textOf("**b** *i* [t](http://u)");
    expect(el.text).toBe("b i t");
    expect(el.boldRanges).toEqual([{ startIndex: 0, endIndex: 1 }]);
    expect(el.italicRanges).toEqual([{ startIndex: 2, endIndex: 3 }]);
    expect(el.links).toEqual([{ startIndex: 4, endIndex: 5, url: "http://u" }]);
  });

  it("formats inline markup inside list items and headings", () => {
    const { elements } = parseMarkdown("## A **bold** heading\n\n- item with *em*");
    const heading = elements.find((e) => e.type === "heading1" || e.type === "heading2")!;
    expect(heading.text).toBe("A bold heading");
    expect(heading.boldRanges).toEqual([{ startIndex: 2, endIndex: 6 }]);
    const item = elements.find((e) => e.type === "list_item")!;
    expect(item.text).toBe("item with em");
    expect(item.italicRanges).toEqual([{ startIndex: 10, endIndex: 12 }]);
  });
});
