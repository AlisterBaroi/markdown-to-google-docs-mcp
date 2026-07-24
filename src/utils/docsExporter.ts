/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversionSettings, DocElement } from "../types";

// --- Google API Interfaces ---

interface GoogleDocsResponse {
  documentId: string;
}

interface GoogleDriveMetadataResponse {
  parents?: string[];
}

interface GoogleDriveFolderResponse {
  id: string;
}

interface StructuralBlock {
  startIndex: number;
  endIndex: number;
  paragraph?: Record<string, unknown>;
  table?: {
    tableRows?: {
      tableCells?: {
        startIndex: number;
        endIndex: number;
        content?: { startIndex: number; endIndex: number }[];
      }[];
    }[];
  };
}

interface GoogleDocsMetadataResponse {
  body?: {
    content?: StructuralBlock[];
  };
}

interface GroupedListGroup {
  type: "list_group";
  items: DocElement[];
}

type GroupedElement = DocElement | GroupedListGroup;

interface BatchUpdateRequest {
  insertText?: {
    text: string;
    location?: { index: number };
    endOfSegmentLocation?: Record<string, unknown>;
  };
  insertTable?: {
    rows: number;
    columns: number;
    location?: { index: number };
    endOfSegmentLocation?: Record<string, unknown>;
  };
  updateParagraphStyle?: {
    paragraphStyle: {
      namedStyleType?: string;
      lineSpacing?: number;
      spacingMode?: string;
      spaceAbove?: { magnitude: number; unit: string };
      spaceBelow?: { magnitude: number; unit: string };
      borderBottom?: {
        color: { color: { rgbColor: { red: number; green: number; blue: number } } };
        width: { magnitude: number; unit: string };
        padding: { magnitude: number; unit: string };
        dashStyle: string;
      };
      alignment?: string;
      shading?: {
        backgroundColor: { color: { rgbColor: { red: number; green: number; blue: number } } };
      };
    };
    fields: string;
    range: { startIndex: number; endIndex: number };
  };
  updateTextStyle?: {
    textStyle: {
      weightedFontFamily?: { fontFamily: string };
      fontSize?: { magnitude: number; unit: string };
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      foregroundColor?: {
        color: { rgbColor: { red: number; green: number; blue: number } };
      };
      link?: { url: string };
    };
    fields: string;
    range: { startIndex: number; endIndex: number };
  };
  createParagraphBullets?: {
    range: { startIndex: number; endIndex: number };
    bulletPreset: string;
  };
  deleteParagraphBullets?: {
    range: { startIndex: number; endIndex: number };
  };
  updateTableCellStyle?: {
    tableCellStyle: {
      backgroundColor: { color: { rgbColor: { red: number; green: number; blue: number } } };
    };
    fields: string;
    tableRange: {
      tableCellLocation: {
        tableStartLocation: { index: number };
        rowIndex: number;
        columnIndex: number;
      };
      rowSpan: number;
      columnSpan: number;
    };
  };
  insertInlineImage?: {
    location: { index: number };
    uri: string;
    objectSize: {
      height: { magnitude: number; unit: string };
      width: { magnitude: number; unit: string };
    };
  };
}

interface CellPair {
  index: number;
  requests: BatchUpdateRequest[];
}

interface ImageRequestGroup {
  index: number;
  requests: BatchUpdateRequest[];
}

interface FormatConfig {
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  color?: { red: number; green: number; blue: number };
  spaceBelow?: number;
  spaceAbove?: number;
  lineSpacing?: number;
}

// --- End of Interfaces ---

/**
 * Creates a blank Google Document with the given title
 */
export async function createBlankDoc(
  accessToken: string,
  title: string,
): Promise<string> {
  const res = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Failed to create doc:", errText);
    throw new Error(`Google Docs creation failed: ${res.statusText}`);
  }

  const data = (await res.json()) as GoogleDocsResponse;
  return data.documentId;
}

/**
 * Moves a Google Doc file to the designated Google Drive folder.
 */
export async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  folderId: string,
): Promise<void> {
  if (!folderId || folderId === "root") {
    return;
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!metaRes.ok) {
    throw new Error("Failed to get current folder metadata for document");
  }

  const metaData = (await metaRes.json()) as GoogleDriveMetadataResponse;
  const currentParents = (metaData.parents || []).join(",");

  const patchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${currentParents}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error("Move PATCH error:", err);
    throw new Error("Failed to move the document to your selected folder");
  }
}

/**
 * Creates a brand-new folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const parents = parentId && parentId !== "root" ? [parentId] : [];

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Create folder error:", err);
    throw new Error("Failed to create a new folder in Google Drive");
  }

  const data = (await res.json()) as GoogleDriveFolderResponse;
  return data.id;
}

/**
 * Converts Markdown elements into styled paragraphs inside a Google Document
 */
export async function styleDocContent(
  accessToken: string,
  documentId: string,
  elements: DocElement[],
  settings: ConversionSettings,
): Promise<{ mermaidEmbedFailed: number }> {
  if (elements.length === 0) return { mermaidEmbedFailed: 0 };

  const groupedElements: GroupedElement[] = [];
  let currentList: DocElement[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "list_item") {
      currentList.push(el);
    } else {
      if (currentList.length > 0) {
        groupedElements.push({ type: "list_group", items: currentList });
        currentList = [];
      }
      groupedElements.push(el);
    }
  }
  if (currentList.length > 0) {
    groupedElements.push({ type: "list_group", items: currentList });
  }

  const insertRequests: BatchUpdateRequest[] = [];
  for (let i = 0; i < groupedElements.length; i++) {
    const group = groupedElements[i];
    const isFirst = i === 0;
    const location = isFirst ? { location: { index: 1 } } : { endOfSegmentLocation: {} };

    if (group.type === "list_group") {
      const listItems = group.items;
      const fullListText = listItems.map((item) => item.text).join("\n") + "\n";
      insertRequests.push({
        insertText: {
          ...location,
          text: fullListText,
        },
      });
    } else if (group.type === "table") {
      const rows = group.tableRows?.length || 1;
      const cols = group.tableRows ? Math.max(...group.tableRows.map((row: string[]) => row.length)) : 1;
      insertRequests.push({
        insertTable: {
          rows,
          columns: cols,
          ...location,
        },
      });
    } else if (group.type === "mermaid" && group.imageUrl) {
      insertRequests.push({
        insertText: {
          ...location,
          text: "\n",
        },
      });
    } else {
      const rawText = group.text || " ";
      const textToInsert = rawText + "\n";
      insertRequests.push({
        insertText: {
          ...location,
          text: textToInsert,
        },
      });
    }
  }

  const firstRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests: insertRequests }),
    },
  );

  if (!firstRes.ok) {
    const errText = await firstRes.text();
    console.error("Structural insert failed:", errText);
    throw new Error("Failed to insert structural components into document");
  }

  const docMetadataRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!docMetadataRes.ok) {
    throw new Error("Failed to retrieve document metadata for index mapping");
  }

  const docMetadata = (await docMetadataRes.json()) as GoogleDocsMetadataResponse;
  const bodyContent = docMetadata.body?.content || [];

  const structuralBlocks = bodyContent.filter(
    (el) => el.paragraph || el.table
  );

  const usableBlocks = structuralBlocks;
  let blockPointer = 0;

  const getNextBlock = (kind: "paragraph" | "table"): StructuralBlock | null => {
    while (blockPointer < usableBlocks.length && !usableBlocks[blockPointer][kind]) {
      blockPointer++;
    }
    if (blockPointer >= usableBlocks.length) {
      return null;
    }
    return usableBlocks[blockPointer++];
  };

  const requests: BatchUpdateRequest[] = [];
  const cellPairs: CellPair[] = [];

  const addTextStyles = (
    el: DocElement,
    start: number,
    end: number,
    formatMapKey: string,
  ) => {
    const styleEnd = end + 1;

    if (el.type === "title") {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: "TITLE" },
          fields: "namedStyleType",
          range: { startIndex: start, endIndex: styleEnd },
        },
      });
    } else if (el.type === "heading1") {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: "HEADING_1" },
          fields: "namedStyleType",
          range: { startIndex: start, endIndex: styleEnd },
        },
      });
    } else if (el.type === "heading2") {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: "HEADING_2" },
          fields: "namedStyleType",
          range: { startIndex: start, endIndex: styleEnd },
        },
      });
    } else {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          fields: "namedStyleType",
          range: { startIndex: start, endIndex: styleEnd },
        },
      });
    }

    const format = settings[formatMapKey as keyof ConversionSettings] as FormatConfig;
    
    const textStyleReq: BatchUpdateRequest = {
      updateTextStyle: {
        textStyle: {
          weightedFontFamily: { fontFamily: format.fontFamily },
          fontSize: { magnitude: format.fontSize, unit: "PT" },
          bold: format.bold,
        },
        fields: "weightedFontFamily,fontSize,bold",
        range: { startIndex: start, endIndex: styleEnd },
      },
    };

    if (format.color && textStyleReq.updateTextStyle?.textStyle) {
      textStyleReq.updateTextStyle.textStyle.foregroundColor = {
        color: {
          rgbColor: {
            red: format.color.red,
            green: format.color.green,
            blue: format.color.blue,
          },
        },
      };
      textStyleReq.updateTextStyle.fields += ",foregroundColor";
    }

    if (el.type === "code_block" && textStyleReq.updateTextStyle?.textStyle) {
      textStyleReq.updateTextStyle.textStyle.weightedFontFamily = { fontFamily: "Courier New" };
      textStyleReq.updateTextStyle.textStyle.fontSize = { magnitude: 11, unit: "PT" };
      textStyleReq.updateTextStyle.fields += ",weightedFontFamily,fontSize";
    }

    requests.push(textStyleReq);

    if (el.links?.length) {
      el.links.forEach((link) => {
        if (link.startIndex === link.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: { link: { url: link.url } },
            fields: "link",
            range: {
              startIndex: start + link.startIndex,
              endIndex: start + link.endIndex,
            },
          },
        });
      });
    }

    if (el.boldRanges?.length) {
      el.boldRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        const boldFormat = settings.textBold;
        const boldReq: BatchUpdateRequest = {
          updateTextStyle: {
            textStyle: {
              bold: boldFormat.bold,
              weightedFontFamily: { fontFamily: boldFormat.fontFamily },
              fontSize: { magnitude: boldFormat.fontSize, unit: "PT" },
            },
            fields: "bold,weightedFontFamily,fontSize",
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        };
        if (boldFormat.color && boldReq.updateTextStyle?.textStyle) {
          boldReq.updateTextStyle.textStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: boldFormat.color.red,
                green: boldFormat.color.green,
                blue: boldFormat.color.blue,
              },
            },
          };
          boldReq.updateTextStyle.fields += ",foregroundColor";
        }
        requests.push(boldReq);
      });
    }

    if (el.italicRanges?.length) {
      el.italicRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        const italicFormat = settings.textItalic;
        const italicReq: BatchUpdateRequest = {
          updateTextStyle: {
            textStyle: {
              italic: true,
              weightedFontFamily: { fontFamily: italicFormat.fontFamily },
              fontSize: { magnitude: italicFormat.fontSize, unit: "PT" },
            },
            fields: "italic,weightedFontFamily,fontSize",
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        };
        if (italicFormat.color && italicReq.updateTextStyle?.textStyle) {
          italicReq.updateTextStyle.textStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: italicFormat.color.red,
                green: italicFormat.color.green,
                blue: italicFormat.color.blue,
              },
            },
          };
          italicReq.updateTextStyle.fields += ",foregroundColor";
        }
        requests.push(italicReq);
      });
    }

    if (el.underlineRanges?.length) {
      el.underlineRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        const uFormat = settings.textUnderline;
        const uReq: BatchUpdateRequest = {
          updateTextStyle: {
            textStyle: {
              underline: true,
              weightedFontFamily: { fontFamily: uFormat.fontFamily },
              fontSize: { magnitude: uFormat.fontSize, unit: "PT" },
            },
            fields: "underline,weightedFontFamily,fontSize",
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        };
        if (uFormat.color && uReq.updateTextStyle?.textStyle) {
          uReq.updateTextStyle.textStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: uFormat.color.red,
                green: uFormat.color.green,
                blue: uFormat.color.blue,
              },
            },
          };
          uReq.updateTextStyle.fields += ",foregroundColor";
        }
        requests.push(uReq);
      });
    }

    if (el.strikethroughRanges?.length) {
      el.strikethroughRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: { strikethrough: true },
            fields: "strikethrough",
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        });
      });
    }

    let spaceBelow = format.spaceBelow !== undefined ? format.spaceBelow : 0;
    if (el.type === "list_item") {
      spaceBelow =
        format.spaceBelow !== undefined
          ? format.spaceBelow
          : el.isLastInList
            ? 8
            : 4;
    } else if (el.type === "code_block") spaceBelow = 0;

    const paragraphStyleReq: BatchUpdateRequest = {
      updateParagraphStyle: {
        paragraphStyle: {
          lineSpacing: format.lineSpacing || 100,
          spacingMode: "NEVER_COLLAPSE",
          spaceAbove: {
            magnitude: format.spaceAbove !== undefined ? format.spaceAbove : 0,
            unit: "PT",
          },
          spaceBelow: { magnitude: spaceBelow, unit: "PT" },
        },
        fields: "lineSpacing,spaceAbove,spaceBelow,spacingMode",
        range: { startIndex: start, endIndex: styleEnd },
      },
    };

    if (el.type === "horizontal_rule" && paragraphStyleReq.updateParagraphStyle?.paragraphStyle) {
      paragraphStyleReq.updateParagraphStyle.paragraphStyle.borderBottom = {
        color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        width: { magnitude: 1, unit: "PT" },
        padding: { magnitude: 0, unit: "PT" },
        dashStyle: "SOLID",
      };
      paragraphStyleReq.updateParagraphStyle.fields += ",borderBottom";
    } else if (el.type === "text" && paragraphStyleReq.updateParagraphStyle?.paragraphStyle) {
      paragraphStyleReq.updateParagraphStyle.paragraphStyle.alignment = "JUSTIFIED";
      paragraphStyleReq.updateParagraphStyle.fields += ",alignment";
    } else if (el.type === "code_block" && paragraphStyleReq.updateParagraphStyle?.paragraphStyle) {
      paragraphStyleReq.updateParagraphStyle.paragraphStyle.shading = {
        backgroundColor: {
          color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
        },
      };
      paragraphStyleReq.updateParagraphStyle.paragraphStyle.alignment = "START";
      paragraphStyleReq.updateParagraphStyle.fields += ",shading,alignment";
    }

    requests.push(paragraphStyleReq);
  };

  for (let i = 0; i < groupedElements.length; i++) {
    const group = groupedElements[i];

    if (group.type === "list_group") {
      const listItems = group.items;
      let firstBlock: StructuralBlock | null = null;
      let lastBlock: StructuralBlock | null = null;

      for (let j = 0; j < listItems.length; j++) {
        const item = listItems[j];
        const block = getNextBlock("paragraph");
        if (block && block.paragraph) {
          if (j === 0) firstBlock = block;
          if (j === listItems.length - 1) lastBlock = block;

          const start = block.startIndex;
          const end = block.endIndex - 1;
          addTextStyles(item, start, end, "list");
        }
      }

      if (firstBlock && lastBlock) {
        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: firstBlock.startIndex,
              endIndex: lastBlock.endIndex,
            },
            bulletPreset: listItems[0].bulleted
              ? "BULLET_DISC_CIRCLE_SQUARE"
              : "NUMBERED_DECIMAL_ALPHA_ROMAN",
          },
        });
      }
    } else if (group.type === "table") {
      const block = getNextBlock("table");
      if (block && block.table) {
        const gTable = block.table;
        const rows = group.tableRows?.length || 1;
        const cols = group.tableRows ? Math.max(...group.tableRows.map((row: string[]) => row.length)) : 1;

        requests.push({
          updateTableCellStyle: {
            tableCellStyle: {
              backgroundColor: {
                color: { rgbColor: { red: 0.9, green: 0.95, blue: 0.98 } },
              },
            },
            fields: "backgroundColor",
            tableRange: {
              tableCellLocation: {
                tableStartLocation: { index: block.startIndex },
                rowIndex: 0,
                columnIndex: 0,
              },
              rowSpan: 1,
              columnSpan: cols,
            },
          },
        });

        if (group.tableRows) {
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const rawCellT = group.tableRows[r]?.[c] || "";
              const cell = gTable.tableRows?.[r]?.tableCells?.[c];

              if (cell && rawCellT.length > 0) {
                const cellInsertIdx = cell.content?.[0]?.startIndex ?? cell.startIndex;
                if (cellInsertIdx === undefined) continue;

                const isHeader = r === 0;
                cellPairs.push({
                  index: cellInsertIdx,
                  requests: [
                    {
                      insertText: {
                        location: { index: cellInsertIdx },
                        text: rawCellT,
                      },
                    },
                    {
                      updateTextStyle: {
                        textStyle: {
                          bold: isHeader,
                          fontSize: { magnitude: 10, unit: "PT" },
                          weightedFontFamily: { fontFamily: settings.text.fontFamily },
                        },
                        fields: "bold,fontSize,weightedFontFamily",
                        range: {
                          startIndex: cellInsertIdx,
                          endIndex: cellInsertIdx + rawCellT.length,
                        },
                      },
                    },
                  ],
                });
              }
            }
          }
        }
      }
    } else {
      const block = getNextBlock("paragraph");
      if (block && block.paragraph) {
        if (group.type === "mermaid" && group.imageUrl) {
          // intentionally blank
        } else {
          const start = block.startIndex;
          const end = block.endIndex - 1;

          requests.push({
            deleteParagraphBullets: {
              range: { startIndex: start, endIndex: block.endIndex },
            },
          });

          let key = "text";
          if (group.type === "title") key = "title";
          else if (group.type === "heading1") key = "heading1";
          else if (group.type === "heading2") key = "heading2";

          addTextStyles(group, start, end, key);
        }
      }
    }
  }

  cellPairs.sort((a, b) => b.index - a.index);
  const cellInsertRequests = cellPairs.flatMap((pair) => pair.requests);

  const finalRequests = [...requests, ...cellInsertRequests];

  if (finalRequests.length > 0) {
    const updateRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests: finalRequests }),
      },
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error("Batch Update failed:", errText);
      throw new Error("Failed to style document content successfully");
    }
  }

  const hasImages = groupedElements.some(
    (g) => g.type === "mermaid" && g.imageUrl
  );
  if (!hasImages) return { mermaidEmbedFailed: 0 };

  const meta2Res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!meta2Res.ok) {
    throw new Error("Failed to retrieve document metadata for image placement");
  }
  const meta2 = (await meta2Res.json()) as GoogleDocsMetadataResponse;
  const blocks2 = (meta2.body?.content || []).filter(
    (el) => el.paragraph || el.table
  );

  const MAX_WIDTH_PT = 450;
  const pxToPt = (px: number) => px * 0.75;

  let imgPointer = 0;
  const nextImageBlock = (kind: "paragraph" | "table"): StructuralBlock | null => {
    while (imgPointer < blocks2.length && !blocks2[imgPointer][kind]) imgPointer++;
    return imgPointer < blocks2.length ? blocks2[imgPointer++] : null;
  };

  const imageRequests: ImageRequestGroup[] = [];
  const insertedUrls: string[] = [];
  for (const group of groupedElements) {
    if (group.type === "list_group") {
      for (let j = 0; j < group.items.length; j++) nextImageBlock("paragraph");
      continue;
    }
    const block = nextImageBlock(group.type === "table" ? "table" : "paragraph");
    if (group.type !== "mermaid" || !group.imageUrl || !block?.paragraph) continue;
    insertedUrls.push(group.imageUrl);

    let widthPt = pxToPt(group.imageWidth || 600);
    let heightPt = pxToPt(group.imageHeight || 400);
    if (widthPt > MAX_WIDTH_PT) {
      const scale = MAX_WIDTH_PT / widthPt;
      widthPt = MAX_WIDTH_PT;
      heightPt = heightPt * scale;
    }

    const startIndex = block.startIndex;
    imageRequests.push({
      index: startIndex,
      requests: [
        {
          updateParagraphStyle: {
            paragraphStyle: { alignment: "CENTER" },
            fields: "alignment",
            range: { startIndex, endIndex: block.endIndex },
          },
        },
        {
          insertInlineImage: {
            location: { index: startIndex },
            uri: group.imageUrl,
            objectSize: {
              height: { magnitude: heightPt, unit: "PT" },
              width: { magnitude: widthPt, unit: "PT" },
            },
          },
        },
      ],
    });
  }

  if (imageRequests.length === 0) return { mermaidEmbedFailed: 0 };

  const cleanupHostedImages = async (): Promise<void> => {
    await Promise.all(
      insertedUrls.map((u) =>
        fetch(u, { method: "DELETE" }).catch(() => {
          /* best-effort */
        })
      )
    );
  };

  imageRequests.sort((a, b) => b.index - a.index);
  const alignReqs = imageRequests.flatMap((p) => p.requests.filter((r) => r.updateParagraphStyle));
  const insertReqs = imageRequests.flatMap((p) => p.requests.filter((r) => r.insertInlineImage));
  const imageBatch = [...alignReqs, ...insertReqs];

  const imgRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests: imageBatch }),
    }
  );

  if (!imgRes.ok) {
    const errText = await imgRes.text();
    console.error("Mermaid image insertion failed (diagrams left blank):", errText);
    await cleanupHostedImages();
    return { mermaidEmbedFailed: imageRequests.length };
  }
  await cleanupHostedImages();
  return { mermaidEmbedFailed: 0 };
}