/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocElement } from "../types";

// Lazy-load mermaid so it's only pulled into the bundle when a diagram is actually rendered.
let mermaidInitialized = false;
async function getMermaid() {
  const mod: any = await import("mermaid");
  const mermaid = mod.default || mod;
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    mermaidInitialized = true;
  }
  return mermaid;
}

/**
 * Render mermaid source to a PNG Blob in the browser (mermaid -> SVG -> canvas -> PNG).
 * Returns the PNG plus the diagram's intrinsic size (used for layout in the Google Doc).
 */
async function renderToPngBlob(
  code: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  const mermaid = await getMermaid();
  const renderId = "mmd-" + Math.random().toString(36).slice(2);
  const { svg } = await mermaid.render(renderId, code);

  // Determine the diagram's intrinsic dimensions from the SVG.
  const svgDoc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgEl = svgDoc.documentElement;
  let width = parseFloat(svgEl.getAttribute("width") || "");
  let height = parseFloat(svgEl.getAttribute("height") || "");
  const viewBox = svgEl.getAttribute("viewBox");
  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    width = width || parts[2];
    height = height || parts[3];
  }
  width = width || 600;
  height = height || 400;

  // Rasterize at 2x for crispness, but report intrinsic size for document layout.
  const scale = 2;
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load mermaid SVG for rasterization"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff"; // diagrams are usually transparent; give them a white backing
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Failed to rasterize mermaid diagram to PNG");
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * For every `mermaid` element, render it and upload the PNG to the app's image host,
 * populating imageUrl/imageWidth/imageHeight in place. On failure the element is left
 * without an imageUrl, and the exporter falls back to showing the diagram source text.
 */
export async function resolveMermaidElements(elements: DocElement[]): Promise<void> {
  for (const el of elements) {
    if (el.type !== "mermaid" || !el.text.trim()) continue;
    try {
      const { blob, width, height } = await renderToPngBlob(el.text);
      const res = await fetch("/api/mermaid", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      if (!res.ok) throw new Error(`Image host upload failed: ${res.status}`);
      const data = await res.json();
      el.imageUrl = data.url;
      el.imageWidth = width;
      el.imageHeight = height;
    } catch (err) {
      console.error("[Mermaid] Failed to render diagram; leaving as source text:", err);
    }
  }
}
