/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RGBColor {
  red: number;
  green: number;
  blue: number;
}

export interface TextFormat {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number; // e.g. 100 = 1.0, 115 = 1.15, 150 = 1.5, etc.
  spaceAbove: number;  // in points (PT)
  spaceBelow: number;  // in points (PT)
  bold: boolean;
  color?: RGBColor;
}

export interface HeaderFooterSettings {
  enabled: boolean;
  text: string;
  fontSize: number;
  color: RGBColor;
}

export interface PageNumberSettings {
  enabled: boolean;
  fontSize: number;
  color: RGBColor;
}

export interface HeadingMapping {
  title: string;
  heading1: string;
  heading2: string;
}

export interface ConversionSettings {
  title: TextFormat;
  heading1: TextFormat;
  heading2: TextFormat;
  text: TextFormat;
  textBold: TextFormat;
  textItalic: TextFormat;
  textUnderline: TextFormat;
  list: TextFormat;
  headingMapping: HeadingMapping;
}

export interface DocElement {
  text: string;
  type: 'title' | 'heading1' | 'heading2' | 'text' | 'list_item' | 'horizontal_rule' | 'code_block' | 'table' | 'mermaid';
  tableRows?: string[][];
  bulleted?: boolean;
  bulletIndex?: number;
  isLastInList?: boolean;
  links?: { startIndex: number; endIndex: number; url: string }[];
  boldRanges?: { startIndex: number; endIndex: number }[];
  italicRanges?: { startIndex: number; endIndex: number }[];
  underlineRanges?: { startIndex: number; endIndex: number }[];
  strikethroughRanges?: { startIndex: number; endIndex: number }[];
  // For 'mermaid' elements: `text` holds the diagram source. After rendering, these are
  // populated with the publicly-fetchable PNG URL (for Docs insertInlineImage) and its pixel size.
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
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
