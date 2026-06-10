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
});
