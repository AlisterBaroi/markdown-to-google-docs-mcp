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

  // 1. Prepare continuous text to insert (joined with newlines)
  const textRuns = elements.map(el => el.text);
  const fullTextToInsert = textRuns.join('\n');

  // 2. Prepare structural updates
  const requests: any[] = [];

  // Request #1: Insert the complete raw text at the body start (index 1)
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullTextToInsert,
    },
  });

  // Calculate coordinates (startIndex and endIndex) for each paragraph
  let currentIndex = 1;
  const styledSegments = elements.map(el => {
    const start = currentIndex;
    const end = start + el.text.length;
    currentIndex = end + 1; // accounting for appended '\n'
    return { start, end, el };
  });

  // Apply typography, sizes, font-weights and spacing
  styledSegments.forEach(({ start, end, el }) => {
    // Determine the key based on node type
    let key: 'title' | 'heading1' | 'text' | 'list' = 'text';
    if (el.type === 'title') key = 'title';
    else if (el.type === 'heading1') key = 'heading1';
    else if (el.type === 'list_item') key = 'list';

    const format = settings[key];

    // Apply Named Styles BEFORE text styles so it doesn't overwrite our custom formatting
    if (el.type === 'title') {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: 'TITLE' },
          fields: 'namedStyleType',
          range: { startIndex: start, endIndex: end },
        },
      });
    } else if (el.type === 'heading1') {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType',
          range: { startIndex: start, endIndex: end },
        },
      });
    }

    // Request to update font family and sizing
    const textStyle: any = {
      weightedFontFamily: {
        fontFamily: format.fontFamily,
      },
      fontSize: {
        magnitude: format.fontSize,
        unit: 'PT',
      },
      bold: format.bold,
    };
    
    let textFields = 'weightedFontFamily,fontSize,bold';

    if (el.type === 'code_block') {
      textStyle.weightedFontFamily = { fontFamily: 'Courier New' };
      textStyle.fontSize = { magnitude: 11, unit: 'PT' };
      textFields += ',weightedFontFamily,fontSize';
    }

    requests.push({
      updateTextStyle: {
        textStyle,
        fields: textFields,
        range: {
          startIndex: start,
          endIndex: end,
        },
      },
    });

    // Apply link formatting if parsing found any links
    if (el.links && el.links.length > 0) {
      el.links.forEach(link => {
        if (link.startIndex === link.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: {
              link: {
                url: link.url
              }
            },
            fields: 'link',
            range: {
              startIndex: start + link.startIndex,
              endIndex: start + link.endIndex
            }
          }
        });
      });
    }

    if (el.boldRanges && el.boldRanges.length > 0) {
      el.boldRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: { bold: true },
            fields: 'bold',
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex
            }
          }
        });
      });
    }

    if (el.italicRanges && el.italicRanges.length > 0) {
      el.italicRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: { italic: true },
            fields: 'italic',
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex
            }
          }
        });
      });
    }

    if (el.strikethroughRanges && el.strikethroughRanges.length > 0) {
      el.strikethroughRanges.forEach(range => {
        if (range.startIndex === range.endIndex) return;
        requests.push({
          updateTextStyle: {
            textStyle: { strikethrough: true },
            fields: 'strikethrough',
            range: {
              startIndex: start + range.startIndex,
              endIndex: start + range.endIndex
            }
          }
        });
      });
    }

    // Request to update line spacing and paragraph margins
    let spaceBelow = format.spaceBelow;
    if (el.type === 'list_item') {
      spaceBelow = 4;
    } else if (el.type === 'code_block') {
      spaceBelow = 0;
    }

    const paragraphStyle: any = {
      lineSpacing: format.lineSpacing,
      spacingMode: 'NEVER_COLLAPSE',
      spaceAbove: {
        magnitude: format.spaceAbove,
        unit: 'PT',
      },
      spaceBelow: {
        magnitude: spaceBelow,
        unit: 'PT',
      },
    };
    
    let paragraphFields = 'lineSpacing,spaceAbove,spaceBelow,spacingMode';
    
    if (el.type === 'horizontal_rule') {
      paragraphStyle.borderBottom = {
        color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        width: { magnitude: 1, unit: 'PT' },
        padding: { magnitude: 0, unit: 'PT' },
        dashStyle: 'SOLID'
      };
      paragraphFields += ',borderBottom';
    } else if (el.type === 'text') {
      paragraphStyle.alignment = 'JUSTIFIED';
      paragraphFields += ',alignment';
    } else if (el.type === 'code_block') {
      paragraphStyle.shading = {
        backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } }
      };
      paragraphStyle.alignment = 'START';
      paragraphFields += ',shading,alignment';
    }

    requests.push({
      updateParagraphStyle: {
        paragraphStyle,
        fields: paragraphFields,
        range: {
          startIndex: start,
          endIndex: end,
        },
      },
    });
  });

  // Group contiguous lists to apply native list styles nicely (bullets or numbers)
  let listStartRange: { start: number; end: number; bulleted: boolean } | null = null;

  for (let i = 0; i < styledSegments.length; i++) {
    const { start, end, el } = styledSegments[i];

    if (el.type === 'list_item') {
      const isBulleted = el.bulleted ?? true;
      if (!listStartRange) {
        listStartRange = { start, end, bulleted: isBulleted };
      } else {
        // If it's part of same running sequence, extend the range
        // If type changes (bullet to numbered), close list and open a new one
        if (listStartRange.bulleted === isBulleted) {
          listStartRange.end = end;
        } else {
          // Close list
          requests.push({
            createParagraphBullets: {
              range: {
                startIndex: listStartRange.start,
                endIndex: listStartRange.end,
              },
              bulletPreset: listStartRange.bulleted
                ? 'BULLET_DISC_CIRCLE_SQUARE'
                : 'NUMBERED_DECIMAL_ALPHA_ROMAN',
            },
          });
          // Start next list
          listStartRange = { start, end, bulleted: isBulleted };
        }
      }
    } else {
      // Non-list item: close list if open
      if (listStartRange) {
        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: listStartRange.start,
              endIndex: listStartRange.end,
            },
            bulletPreset: listStartRange.bulleted
              ? 'BULLET_DISC_CIRCLE_SQUARE'
              : 'NUMBERED_DECIMAL_ALPHA_ROMAN',
          },
        });
        listStartRange = null;
      }
    }
  }

  // Final flush for trailing list sequence
  if (listStartRange) {
    requests.push({
      createParagraphBullets: {
        range: {
          startIndex: listStartRange.start,
          endIndex: listStartRange.end,
        },
        bulletPreset: listStartRange.bulleted
          ? 'BULLET_DISC_CIRCLE_SQUARE'
          : 'NUMBERED_DECIMAL_ALPHA_ROMAN',
      },
    });
  }

  // Execute the batch updates in one single HTTP POST transaction
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error('Batch Update failed:', errText);
    throw new Error('Failed to style document content successfully');
  }
}
