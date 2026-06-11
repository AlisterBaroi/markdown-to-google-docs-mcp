/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for styleDocContent's block alignment against a mocked Google Docs API.
 * The mock reproduces the API behavior that broke the original 1:1 alignment assumption:
 * InsertTableRequest adds an implicit newline paragraph before every table.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { styleDocContent } from "../src/utils/docsExporter";
import { ConversionSettings, DocElement } from "../src/types";

const format = {
  fontFamily: "Arial",
  fontSize: 11,
  lineSpacing: 100,
  spaceAbove: 0,
  spaceBelow: 0,
  bold: false,
};

const settings: ConversionSettings = {
  title: { ...format, fontSize: 24, bold: true },
  heading1: { ...format, fontSize: 20, bold: true },
  heading2: { ...format, fontSize: 16, bold: true },
  text: { ...format },
  textBold: { ...format, bold: true },
  textItalic: { ...format },
  textUnderline: { ...format },
  list: { ...format },
  headingMapping: { title: "#", heading1: "##", heading2: "###" },
};

const el = (partial: Partial<DocElement>): DocElement => ({
  text: "",
  type: "text",
  links: [],
  boldRanges: [],
  italicRanges: [],
  underlineRanges: [],
  strikethroughRanges: [],
  ...partial,
});

/** Builds a 2x2 table block whose cells carry content insert indices. */
const tableBlock = (startIndex: number) => ({
  startIndex,
  endIndex: startIndex + 12,
  table: {
    tableRows: [
      {
        tableCells: [
          { startIndex: startIndex + 1, content: [{ startIndex: startIndex + 2 }] },
          { startIndex: startIndex + 4, content: [{ startIndex: startIndex + 5 }] },
        ],
      },
      {
        tableCells: [
          { startIndex: startIndex + 7, content: [{ startIndex: startIndex + 8 }] },
          { startIndex: startIndex + 10, content: [{ startIndex: startIndex + 11 }] },
        ],
      },
    ],
  },
});

const paragraphBlock = (startIndex: number, endIndex: number) => ({
  startIndex,
  endIndex,
  paragraph: {},
});

/**
 * Mocks fetch for the styleDocContent call sequence:
 * batchUpdate (structure) -> GET doc -> batchUpdate (styles + cells)
 * [-> GET doc -> batchUpdate (images) -> DELETE per image, when diagrams are embedded]
 * Captures every batchUpdate request body.
 */
function mockDocsApi(bodyContent: any[]) {
  const batches: any[][] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.includes(":batchUpdate")) {
      batches.push(JSON.parse(init.body as string).requests);
      return { ok: true, json: async () => ({}), text: async () => "" } as any;
    }
    if (init?.method === "DELETE") {
      return { ok: true, json: async () => ({ deleted: true }) } as any;
    }
    // GET document metadata
    return { ok: true, json: async () => ({ body: { content: bodyContent } }) } as any;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { batches, fetchMock };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("styleDocContent block alignment", () => {
  it("fills table cells despite the implicit newline paragraph before the table", async () => {
    const elements: DocElement[] = [
      el({ text: "Intro", type: "text" }),
      el({
        type: "table",
        tableRows: [
          ["Name", "Role"],
          ["Alice", "Engineer"],
        ],
      }),
      el({ text: "After", type: "text" }),
    ];

    // What the Docs API actually returns: the table is preceded by an implicit
    // newline paragraph, and the body keeps its trailing empty paragraph.
    const body = [
      paragraphBlock(1, 7), // "Intro\n"
      paragraphBlock(7, 8), // implicit newline inserted by InsertTableRequest
      tableBlock(8), // the table (cells at 10, 13, 16, 19)
      paragraphBlock(21, 27), // "After\n"
      paragraphBlock(27, 28), // trailing empty paragraph
    ];

    const { batches } = mockDocsApi(body);
    const result = await styleDocContent("tok", "doc1", elements, settings);
    expect(result.mermaidEmbedFailed).toBe(0);

    // batches[0] = structural inserts, batches[1] = styles + cell content
    const finalBatch = batches[1];
    const cellInserts = finalBatch.filter((r: any) => r.insertText);
    expect(cellInserts.map((r: any) => r.insertText.text)).toEqual([
      // descending index order so earlier inserts don't shift later ones
      "Engineer",
      "Alice",
      "Role",
      "Name",
    ]);
    expect(cellInserts.map((r: any) => r.insertText.location.index)).toEqual([
      19, 16, 13, 10,
    ]);

    // Header background styling targets the real table start, not the newline paragraph.
    const headerStyle = finalBatch.find((r: any) => r.updateTableCellStyle);
    expect(
      headerStyle.updateTableCellStyle.tableRange.tableCellLocation.tableStartLocation.index,
    ).toBe(8);

    // The paragraph after the table is styled at its own block, not shifted into the table.
    const afterStyles = finalBatch.filter(
      (r: any) => r.updateParagraphStyle?.range.startIndex === 21,
    );
    expect(afterStyles.length).toBeGreaterThan(0);
  });

  it("places a mermaid image on its own placeholder paragraph after a table", async () => {
    const elements: DocElement[] = [
      el({
        type: "table",
        tableRows: [
          ["A", "B"],
          ["C", "D"],
        ],
      }),
      el({
        text: "graph TD; A-->B",
        type: "mermaid",
        imageUrl: "http://host/api/mermaid/abc.png",
        imageWidth: 600,
        imageHeight: 400,
      }),
    ];

    const body = [
      paragraphBlock(1, 2), // implicit newline before the table
      tableBlock(2), // the table
      paragraphBlock(15, 16), // mermaid placeholder paragraph
      paragraphBlock(16, 17), // trailing empty paragraph
    ];

    const { batches } = mockDocsApi(body);
    const result = await styleDocContent("tok", "doc1", elements, settings);
    expect(result.mermaidEmbedFailed).toBe(0);

    // batches[2] = image placement batch
    const imageBatch = batches[2];
    const imageInsert = imageBatch.find((r: any) => r.insertInlineImage);
    expect(imageInsert).toBeDefined();
    expect(imageInsert.insertInlineImage.location.index).toBe(15);
    expect(imageInsert.insertInlineImage.uri).toBe("http://host/api/mermaid/abc.png");
  });
});