/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversionSettings, DocElement } from "../types";

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

  const data = await res.json();
  return data.documentId;
}

/**
 * Moves a Google Doc file to the designated Google Drive folder.
 */
export async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  folderId: string,
) {
  if (!folderId || folderId === "root") {
    return; // Already in root directory by default
  }

  // 1. Fetch current parents
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!metaRes.ok) {
    throw new Error("Failed to get current folder metadata for document");
  }

  const metaData = await metaRes.json();
  const currentParents = (metaData.parents || []).join(",");

  // 2. Patch file to move parents
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

  const data = await res.json();
  return data.id;
}

/**
 * Convers Markdown elements into styled paragraphs inside a Google Document
 */
export async function styleDocContent(
  accessToken: string,
  documentId: string,
  elements: DocElement[],
  settings: ConversionSettings,
): Promise<{ mermaidEmbedFailed: number }> {
  if (elements.length === 0) return { mermaidEmbedFailed: 0 };

  // 1. Group contiguous list items to apply native lists successfully
  const groupedElements: any[] = [];
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

  // Step 1: Insert content structures sequentially (No formatting/indices calculation needed!)
  const insertRequests: any[] = [];
  for (let i = 0; i < groupedElements.length; i++) {
    const group = groupedElements[i];
    const isFirst = i === 0;
    const location = isFirst ? { location: { index: 1 } } : { endOfSegmentLocation: {} };

    if (group.type === "list_group") {
      const listItems = group.items as DocElement[];
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
      // Empty placeholder paragraph; the rendered diagram image is inserted into it later
      // (Batch 3), once we know its real index. Falls through to text if rendering failed.
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

  // Execute Step 1 batchUpdate to populate structure
  console.log("[DEBUG] Grouped markdown elements to insert:", JSON.stringify(groupedElements, null, 2));
  console.log("[DEBUG] Sending structural insert requests to Google Docs:", JSON.stringify(insertRequests, null, 2));

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

  // Step 2: Fetch the fully structure-populated document metadata to get real indices
  const docMetadataRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!docMetadataRes.ok) {
    throw new Error("Failed to retrieve document metadata for index mapping");
  }

  const docMetadata = await docMetadataRes.json();
  const bodyContent = docMetadata.body?.content || [];
  console.log("[DEBUG] Full body content from retrieved Doc Metadata:", JSON.stringify(bodyContent, null, 2));

  // Filter the paragraph and table blocks to align with groupedElements
  const structuralBlocks = bodyContent.filter(
    (el: any) => el.paragraph || el.table
  );
  console.log("[DEBUG] Filtered Structural Blocks (Paragraphs & Tables):", JSON.stringify(structuralBlocks, null, 2));

  // The blocks do NOT align 1:1 with groupedElements: the Docs API inserts an implicit
  // newline paragraph before every table (InsertTableRequest: "A newline character will be
  // inserted before it"), and the body keeps its trailing empty paragraph. Walk the blocks
  // with a pointer that advances past blocks of the wrong kind, so each group is matched to
  // the next block of its own kind.
  const usableBlocks = structuralBlocks;

  let blockPointer = 0;
  const getNextBlock = (kind: "paragraph" | "table") => {
    while (blockPointer < usableBlocks.length && !usableBlocks[blockPointer][kind]) {
      blockPointer++;
    }
    if (blockPointer >= usableBlocks.length) {
      console.warn(`[DEBUG] getNextBlock ran out of usableBlocks looking for a ${kind}! Pointer:`, blockPointer);
      return null;
    }
    const block = usableBlocks[blockPointer++];
    console.log(`[DEBUG] getNextBlock (Pointer: ${blockPointer - 1}, kind: ${kind}) returned block:`, JSON.stringify(block, null, 2));
    return block;
  };

  const requests: any[] = [];
  const cellPairs: { index: number; requests: any[] }[] = [];

  // Helper to push text formatting
  const addTextStyles = (
    el: DocElement,
    start: number,
    end: number,
    formatMapKey: string,
  ) => {
    // Add 1 to end index to explicitly encompass the terminating newline character
    // which ensures consistent paragraph styling and inherits text styling.
    const styleEnd = end + 1;

    const format = settings[formatMapKey as keyof ConversionSettings] as any;
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

    const textStyle: any = {
      weightedFontFamily: { fontFamily: format.fontFamily },
      fontSize: { magnitude: format.fontSize, unit: "PT" },
      bold: format.bold,
    };
    let textFields = "weightedFontFamily,fontSize,bold";

    if (format.color) {
      textStyle.foregroundColor = {
        color: {
          rgbColor: {
            red: format.color.red,
            green: format.color.green,
            blue: format.color.blue,
          },
        },
      };
      textFields += ",foregroundColor";
    }

    if (el.type === "code_block") {
      textStyle.weightedFontFamily = { fontFamily: "Courier New" };
      textStyle.fontSize = { magnitude: 11, unit: "PT" };
      textFields += ",weightedFontFamily,fontSize";
    }

    requests.push({
      updateTextStyle: {
        textStyle,
        fields: textFields,
        range: { startIndex: start, endIndex: styleEnd },
      },
    });

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
        const boldStyle: any = {
          bold: boldFormat.bold,
          weightedFontFamily: { fontFamily: boldFormat.fontFamily },
          fontSize: { magnitude: boldFormat.fontSize, unit: "PT" },
        };
        let bFields = "bold,weightedFontFamily,fontSize";
        if (boldFormat.color) {
          boldStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: boldFormat.color.red,
                green: boldFormat.color.green,
                blue: boldFormat.color.blue,
              },
            },
          };
          bFields += ",foregroundColor";
        }
        requests.push({
          updateTextStyle: {
            textStyle: boldStyle,
            fields: bFields,
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        });
      });
    }
    if (el.italicRanges?.length) {
      el.italicRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        const italicFormat = settings.textItalic;
        const italicStyle: any = {
          italic: true,
          weightedFontFamily: { fontFamily: italicFormat.fontFamily },
          fontSize: { magnitude: italicFormat.fontSize, unit: "PT" },
        };
        let iFields = "italic,weightedFontFamily,fontSize";
        if (italicFormat.color) {
          italicStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: italicFormat.color.red,
                green: italicFormat.color.green,
                blue: italicFormat.color.blue,
              },
            },
          };
          iFields += ",foregroundColor";
        }
        requests.push({
          updateTextStyle: {
            textStyle: italicStyle,
            fields: iFields,
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        });
      });
    }
    if (el.underlineRanges?.length) {
      el.underlineRanges.forEach((range) => {
        if (range.startIndex === range.endIndex) return;
        const uFormat = settings.textUnderline;
        const uStyle: any = {
          underline: true,
          weightedFontFamily: { fontFamily: uFormat.fontFamily },
          fontSize: { magnitude: uFormat.fontSize, unit: "PT" },
        };
        let uFields = "underline,weightedFontFamily,fontSize";
        if (uFormat.color) {
          uStyle.foregroundColor = {
            color: {
              rgbColor: {
                red: uFormat.color.red,
                green: uFormat.color.green,
                blue: uFormat.color.blue,
              },
            },
          };
          uFields += ",foregroundColor";
        }
        requests.push({
          updateTextStyle: {
            textStyle: uStyle,
            fields: uFields,
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex,
            },
          },
        });
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

    const paragraphStyle: any = {
      lineSpacing: format.lineSpacing || 100,
      spacingMode: "NEVER_COLLAPSE",
      spaceAbove: {
        magnitude: format.spaceAbove !== undefined ? format.spaceAbove : 0,
        unit: "PT",
      },
      spaceBelow: { magnitude: spaceBelow, unit: "PT" },
    };
    let paragraphFields = "lineSpacing,spaceAbove,spaceBelow,spacingMode";

    if (el.type === "horizontal_rule") {
      paragraphStyle.borderBottom = {
        color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        width: { magnitude: 1, unit: "PT" },
        padding: { magnitude: 0, unit: "PT" },
        dashStyle: "SOLID",
      };
      paragraphFields += ",borderBottom";
    } else if (el.type === "text") {
      paragraphStyle.alignment = "JUSTIFIED";
      paragraphFields += ",alignment";
    } else if (el.type === "code_block") {
      paragraphStyle.shading = {
        backgroundColor: {
          color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
        },
      };
      paragraphStyle.alignment = "START";
      paragraphFields += ",shading,alignment";
    }

    requests.push({
      updateParagraphStyle: {
        paragraphStyle,
        fields: paragraphFields,
        range: { startIndex: start, endIndex: styleEnd },
      },
    });
  };

  for (let i = 0; i < groupedElements.length; i++) {
    const group = groupedElements[i];

    if (group.type === "list_group") {
      const listItems = group.items as DocElement[];
      let firstBlock: any = null;
      let lastBlock: any = null;

      for (let j = 0; j < listItems.length; j++) {
        const item = listItems[j];
        const block = getNextBlock("paragraph");
        if (block && block.paragraph) {
          if (j === 0) firstBlock = block;
          if (j === listItems.length - 1) lastBlock = block;

          const start = block.startIndex;
          const end = block.endIndex - 1; // omit the trailing newline
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
      console.log("[DEBUG] Group element is a table. Retrieving table block...");
      const block = getNextBlock("table");
      if (block) {
        console.log("[DEBUG] Recovered block for table:", JSON.stringify(block, null, 2));
      } else {
        console.warn("[DEBUG] Recovered block for table is NULL!");
      }
      if (block && block.table) {
        const gTable = block.table;
        const rows = group.tableRows?.length || 1;
        const cols = group.tableRows ? Math.max(...group.tableRows.map((row: string[]) => row.length)) : 1;
        console.log(`[DEBUG] Table metadata from group: rows=${rows}, cols=${cols}`);
        console.log("[DEBUG] Table structure from Doc Metadata:", JSON.stringify(gTable, null, 2));

        // Apply header background formatting
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

        // Collect cell text insertions
        if (group.tableRows) {
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const rawCellT = group.tableRows[r]?.[c] || "";
              const cell = gTable.tableRows?.[r]?.tableCells?.[c];
              console.log(`[DEBUG] Processing cells [row=${r}, col=${c}]: text="${rawCellT}"`);
              if (cell) {
                console.log(`[DEBUG] Found TableCell in Doc Metadata: startIndex=${cell.startIndex}, endIndex=${cell.endIndex}`);
                if (cell.content && cell.content.length > 0) {
                  console.log(`[DEBUG] Cell content first element:`, JSON.stringify(cell.content[0], null, 2));
                }
              } else {
                console.warn(`[DEBUG] TableCell was NOT found in Doc Metadata at Row ${r}, Col ${c}!`);
              }

              if (cell && rawCellT.length > 0) {
                const cellInsertIdx = cell.content?.[0]?.startIndex ?? cell.startIndex;
                console.log(`[DEBUG] Computed cellInsertIdx = ${cellInsertIdx}`);
                if (cellInsertIdx === undefined) {
                  console.warn(`[DEBUG] cellInsertIdx is undefined for cell [row=${r}, col=${c}]`);
                  continue;
                }

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
      } else {
        console.warn("[DEBUG] Block is NOT a table: block.table is falsy!", block);
      }
    } else {
      console.log(`[DEBUG] Group element is not list or table (type=${group.type}). Getting next block...`);
      const block = getNextBlock("paragraph");
      if (block) {
        console.log(`[DEBUG] Block for non-table/list (type=${group.type}): startIndex=${block.startIndex}, endIndex=${block.endIndex}`);
      } else {
        console.warn(`[DEBUG] Block for non-table/list (type=${group.type}) is NULL!`);
      }
      if (block && block.paragraph) {
        // Image mermaids are styled+filled in Batch 3 (after re-fetching indices); the
        // placeholder paragraph just needs its slot here to keep block alignment.
        if (group.type === "mermaid" && group.imageUrl) {
          // intentionally no styling here
        } else {
          const start = block.startIndex;
          const end = block.endIndex - 1; // omit the trailing newline

          // Prevent bullet leaks
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

  // Sort cell insertions in DESCENDING order of index! (Very important to avoid shifting lower index elements!)
  console.log(`[DEBUG] Raw cellPairs collected:`, JSON.stringify(cellPairs, null, 2));
  cellPairs.sort((a, b) => b.index - a.index);
  console.log(`[DEBUG] Sorted cellPairs:`, JSON.stringify(cellPairs, null, 2));
  const cellInsertRequests = cellPairs.flatMap((pair) => pair.requests);

  // Combine formatting and cell content insertions
  const finalRequests = [...requests, ...cellInsertRequests];
  console.log("[DEBUG] Sending batchUpdate requests final list:", JSON.stringify(finalRequests, null, 2));

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
    } else {
      console.log("[DEBUG] Batch update succeeded!");
    }
  } else {
    console.log("[DEBUG] No formatting/insert requests generated.");
  }

  // Step 3: insert rendered mermaid diagram images into their placeholder paragraphs.
  // Done last with freshly re-fetched indices (Batch 2's cell inserts shift positions),
  // and images inserted in descending index order so earlier inserts don't move later ones.
  const hasImages = groupedElements.some(
    (g: any) => g.type === "mermaid" && g.imageUrl
  );
  if (!hasImages) return { mermaidEmbedFailed: 0 };

  const meta2Res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!meta2Res.ok) {
    throw new Error("Failed to retrieve document metadata for image placement");
  }
  const meta2 = await meta2Res.json();
  const blocks2 = (meta2.body?.content || []).filter(
    (el: any) => el.paragraph || el.table
  );

  // Page content width is ~468pt (Letter, 1in margins). Cap diagrams to that, keep aspect ratio.
  const MAX_WIDTH_PT = 450;
  const pxToPt = (px: number) => px * 0.75; // 96dpi -> pt

  // Walk groups/blocks with the same kind-aware pointer as the styling pass: list groups
  // consume one paragraph per item, tables skip their implicit leading newline paragraph.
  let imgPointer = 0;
  const nextImageBlock = (kind: "paragraph" | "table") => {
    while (imgPointer < blocks2.length && !blocks2[imgPointer][kind]) imgPointer++;
    return imgPointer < blocks2.length ? blocks2[imgPointer++] : null;
  };

  const imageRequests: { index: number; requests: any[] }[] = [];
  const insertedUrls: string[] = [];
  for (const group of groupedElements) {
    if (group.type === "list_group") {
      for (let j = 0; j < (group.items as DocElement[]).length; j++) nextImageBlock("paragraph");
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

  // Once these images are hosted no longer needed, delete them from the app server. Google
  // copies the bytes into the Doc synchronously during the insert batch, so it's safe to
  // delete right after the call returns (success or failure). TTL sweep is the backstop.
  const cleanupHostedImages = async () => {
    await Promise.all(
      insertedUrls.map((u) =>
        fetch(u, { method: "DELETE" }).catch(() => {
          /* best-effort; the server's TTL will reclaim it anyway */
        })
      )
    );
  };

  // Alignment requests don't shift indices; image inserts do — so emit all alignment
  // updates first, then the inserts in descending index order.
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
    // Non-fatal: the document is already built. The most common cause is Google being
    // unable to fetch the image URL (e.g. a localhost dev server it can't reach), so we
    // log and leave the placeholder rather than failing the whole conversion.
    const errText = await imgRes.text();
    console.error("Mermaid image insertion failed (diagrams left blank):", errText);
    await cleanupHostedImages();
    return { mermaidEmbedFailed: imageRequests.length };
  }
  console.log("[DEBUG] Mermaid image insertion succeeded!");
  await cleanupHostedImages();
  return { mermaidEmbedFailed: 0 };
}
