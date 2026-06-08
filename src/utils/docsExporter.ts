/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversionSettings, DocElement } from '../types';

/**
 * Creates a blank Google Document with the given title
 */
export async function createBlankDoc(accessToken: string, title: string): Promise<string> {
  const res = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Failed to create doc:', errText);
    throw new Error(`Google Docs creation failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.documentId;
}

/**
 * Moves a Google Doc file to the designated Google Drive folder.
 */
export async function moveFileToFolder(accessToken: string, fileId: string, folderId: string) {
  if (!folderId || folderId === 'root') {
    return; // Already in root directory by default
  }

  // 1. Fetch current parents
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    throw new Error('Failed to get current folder metadata for document');
  }

  const metaData = await metaRes.json();
  const currentParents = (metaData.parents || []).join(',');

  // 2. Patch file to move parents
  const patchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${currentParents}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error('Move PATCH error:', err);
    throw new Error('Failed to move the document to your selected folder');
  }
}

/**
 * Creates a brand-new folder in Google Drive
 */
export async function createDriveFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const parents = parentId && parentId !== 'root' ? [parentId] : [];
  
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Create folder error:', err);
    throw new Error('Failed to create a new folder in Google Drive');
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
  settings: ConversionSettings
) {
  if (elements.length === 0) return;

  // 1. Group contiguous list items to apply native lists successfully
  const groupedElements: any[] = [];
  let currentList: DocElement[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'list_item') {
      currentList.push(el);
    } else {
      if (currentList.length > 0) {
        groupedElements.push({ type: 'list_group', items: currentList });
        currentList = [];
      }
      groupedElements.push(el);
    }
  }
  if (currentList.length > 0) {
    groupedElements.push({ type: 'list_group', items: currentList });
  }

  // 2. Prepare structural updates (BACKWARDS processing for perfect indices)
  const requests: any[] = [];

  // Helper to push text formatting
  const addTextStyles = (el: DocElement, start: number, end: number, formatMapKey: string) => {
    const format = settings[formatMapKey as keyof ConversionSettings];
    if (el.type === 'title') {
      requests.push({ updateParagraphStyle: { paragraphStyle: { namedStyleType: 'TITLE' }, fields: 'namedStyleType', range: { startIndex: start, endIndex: end } } });
    } else if (el.type === 'heading1') {
      requests.push({ updateParagraphStyle: { paragraphStyle: { namedStyleType: 'HEADING_1' }, fields: 'namedStyleType', range: { startIndex: start, endIndex: end } } });
    } else {
      requests.push({ updateParagraphStyle: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType', range: { startIndex: start, endIndex: end } } });
    }

    const textStyle: any = { weightedFontFamily: { fontFamily: format.fontFamily }, fontSize: { magnitude: format.fontSize, unit: 'PT' }, bold: format.bold };
    let textFields = 'weightedFontFamily,fontSize,bold';

    if (el.type === 'code_block') {
      textStyle.weightedFontFamily = { fontFamily: 'Courier New' };
      textStyle.fontSize = { magnitude: 11, unit: 'PT' };
      textFields += ',weightedFontFamily,fontSize';
    }

    requests.push({ updateTextStyle: { textStyle, fields: textFields, range: { startIndex: start, endIndex: end } } });

    if (el.links?.length) {
      el.links.forEach(link => {
        if (link.startIndex === link.endIndex) return;
        requests.push({ updateTextStyle: { textStyle: { link: { url: link.url } }, fields: 'link', range: { startIndex: start + link.startIndex, endIndex: start + link.endIndex } } });
      });
    }
    if (el.boldRanges?.length) {
      el.boldRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({ updateTextStyle: { textStyle: { bold: true }, fields: 'bold', range: { startIndex: start + range.startIndex, endIndex: start + range.endIndex } } });
      });
    }
    if (el.italicRanges?.length) {
      el.italicRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({ updateTextStyle: { textStyle: { italic: true }, fields: 'italic', range: { startIndex: start + range.startIndex, endIndex: start + range.endIndex } } });
      });
    }
    if (el.strikethroughRanges?.length) {
      el.strikethroughRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({ updateTextStyle: { textStyle: { strikethrough: true }, fields: 'strikethrough', range: { startIndex: start + range.startIndex, endIndex: start + range.endIndex } } });
      });
    }

    let spaceBelow = format.spaceBelow || 0;
    if (el.type === 'list_item') spaceBelow = 4;
    else if (el.type === 'code_block') spaceBelow = 0;

    const paragraphStyle: any = {
      lineSpacing: format.lineSpacing || 100, spacingMode: 'NEVER_COLLAPSE',
      spaceAbove: { magnitude: format.spaceAbove || 0, unit: 'PT' }, spaceBelow: { magnitude: spaceBelow, unit: 'PT' }
    };
    let paragraphFields = 'lineSpacing,spaceAbove,spaceBelow,spacingMode';

    if (el.type === 'horizontal_rule') {
      paragraphStyle.borderBottom = { color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } }, width: { magnitude: 1, unit: 'PT' }, padding: { magnitude: 0, unit: 'PT' }, dashStyle: 'SOLID' };
      paragraphFields += ',borderBottom';
    } else if (el.type === 'text') {
      paragraphStyle.alignment = 'JUSTIFIED';
      paragraphFields += ',alignment';
    } else if (el.type === 'code_block') {
      paragraphStyle.shading = { backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } } };
      paragraphStyle.alignment = 'START';
      paragraphFields += ',shading,alignment';
    }

    requests.push({ updateParagraphStyle: { paragraphStyle, fields: paragraphFields, range: { startIndex: start, endIndex: end } } });
  };

  for (let i = groupedElements.length - 1; i >= 0; i--) {
    const group = groupedElements[i];

    if (group.type === 'list_group') {
      const listItems = group.items as DocElement[];
      const fullListText = listItems.map(item => item.text).join('\n') + '\n';
      requests.push({ insertText: { location: { index: 1 }, text: fullListText } });

      let currIdx = 1;
      for (let j = 0; j < listItems.length; j++) {
        const item = listItems[j];
        addTextStyles(item, currIdx, currIdx + item.text.length, 'list');
        currIdx += item.text.length + 1;
      }
      
      requests.push({
        createParagraphBullets: {
          range: { startIndex: 1, endIndex: 1 + fullListText.length },
          bulletPreset: listItems[0].bulleted ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN'
        }
      });
    } else if (group.type === 'table') {
      const rows = group.tableRows?.length || 1;
      const cols = group.tableRows?.[0]?.length || 1;
      
      requests.push({ insertTable: { rows, columns: cols, location: { index: 1 } } });
      
      if (group.tableRows) {
        // Style header background (sent before text so it applies to the table directly)
        requests.push({
          updateTableCellStyle: {
            tableCellStyle: { backgroundColor: { color: { rgbColor: { red: 0.9, green: 0.95, blue: 0.98 } } } },
            fields: 'backgroundColor',
            tableRange: { tableCellLocation: { tableStartLocation: { index: 2 }, rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols }
          }
        });

        // Insert text backwards (last row, last col -> first row, first col)
        for (let r = rows - 1; r >= 0; r--) {
          for (let c = cols - 1; c >= 0; c--) {
            const rawCellT = (group.tableRows[r][c] || '');
            const cellText = rawCellT + '\n';
            // Docs API table indexing:
            // Table starts at index 2 (1 is the implicit initial \n).
            // Row 0 start: 3. Cell 0,0 start: 4. Text index: 5.
            const cellInsertIdx = 5 + r * (2 * cols + 1) + 2 * c;
            
            if (rawCellT.length > 0) {
              requests.push({ insertText: { location: { index: cellInsertIdx }, text: rawCellT } });
              
              if (r === 0) {
                requests.push({
                  updateTextStyle: { textStyle: { bold: true }, fields: 'bold', range: { startIndex: cellInsertIdx, endIndex: cellInsertIdx + rawCellT.length } }
                });
              }
              // Normal font config for table
              requests.push({
                  updateTextStyle: { textStyle: { fontSize: { magnitude: 11, unit: 'PT' } }, fields: 'fontSize', range: { startIndex: cellInsertIdx, endIndex: cellInsertIdx + rawCellT.length } }
              });
            }
          }
        }
      }
    } else {
      const rawText = group.text || ' ';
      requests.push({ insertText: { location: { index: 1 }, text: rawText + '\n' } });
      
      // Prevent inheriting list styles from elements below it when inserting backwards
      requests.push({
        deleteParagraphBullets: {
          range: { startIndex: 1, endIndex: 1 + rawText.length + 1 }
        }
      });
      
      let key = 'text';
      if (group.type === 'title') key = 'title';
      else if (group.type === 'heading1') key = 'heading1';
      
      addTextStyles(group, 1, 1 + rawText.length, key);
    }
  }

  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error('Batch Update failed:', errText);
    throw new Error('Failed to style document content successfully');
  }
}
