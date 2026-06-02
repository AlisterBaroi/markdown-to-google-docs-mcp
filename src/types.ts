/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TextFormat {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number; // e.g. 100 = 1.0, 115 = 1.15, 150 = 1.5, etc.
  spaceAbove: number;  // in points (PT)
  spaceBelow: number;  // in points (PT)
  bold: boolean;
}

export interface ConversionSettings {
  title: TextFormat;
  heading1: TextFormat;
  text: TextFormat;
  list: TextFormat; // list has a custom last-bullet spaceBelow of 8 programmatically
}

export interface DocElement {
  text: string;
  type: 'title' | 'heading1' | 'text' | 'list_item' | 'horizontal_rule' | 'code_block';
  bulleted?: boolean;
  bulletIndex?: number;
  isLastInList?: boolean;
  links?: { startIndex: number; endIndex: number; url: string }[];
  boldRanges?: { startIndex: number; endIndex: number }[];
  italicRanges?: { startIndex: number; endIndex: number }[];
  strikethroughRanges?: { startIndex: number; endIndex: number }[];
}

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

export interface UploadedFile {
  name: string;
  content: string;
  size: number;
  docUrl?: string;
  docId?: string;
  status: 'pending' | 'converting' | 'success' | 'failed';
  error?: string;
}
