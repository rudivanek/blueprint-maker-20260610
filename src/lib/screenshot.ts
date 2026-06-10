// src/lib/screenshot.ts
//
// Prepares Firecrawl full-page screenshots for the AI APIs.
//
// Why this exists:
// - Firecrawl's screenshot@fullPage of a long landing page can be 1280 x 15000+ px.
// - The Anthropic API rejects images larger than ~8000px in either dimension,
//   and very tall images lose detail when auto-downscaled.
// - Solution: slice the screenshot vertically into chunks (max ~7600px tall),
//   downscale width to a sane size, and return each slice as a JPEG data URI.
//   The slices are sent as multiple image blocks in one message — Claude reads
//   them top-to-bottom as one continuous page.

export interface ScreenshotSlice {
  dataUri: string; // data:image/jpeg;base64,....
}

const MAX_SLICE_HEIGHT = 7600; // px, safely under the 8000px API limit
const TARGET_WIDTH = 1366;     // px, good balance of legibility vs. token cost
const JPEG_QUALITY = 0.8;
const DEFAULT_MAX_SLICES = 5;  // cost guard — taller pages get downscaled instead

/**
 * Load an image from a data URI or remote URL into an HTMLImageElement.
 * Tries fetch->blob first (best CORS behavior for Firecrawl storage URLs),
 * falls back to a crossOrigin <img> load.
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  let objectUrl: string | null = null;
  let imgSrc = src;

  if (!src.startsWith('data:')) {
    try {
      const resp = await fetch(src, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      objectUrl = URL.createObjectURL(blob);
      imgSrc = objectUrl;
    } catch {
      // fall through — try direct <img crossOrigin> load below
      imgSrc = src;
    }
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load screenshot image'));
      img.src = imgSrc;
    });
    return img;
  } finally {
    // Revoke after the image has decoded (or failed)
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 10000);
  }
}

/**
 * Slice a (potentially very tall) screenshot into API-safe JPEG data URIs.
 *
 * @param src        data URI or URL of the screenshot
 * @param maxSlices  hard cap on number of slices (default 5). If the page is
 *                   taller than maxSlices * MAX_SLICE_HEIGHT at target width,
 *                   the whole image is downscaled further so it still fits.
 * @returns array of data URIs, top-to-bottom. Empty array on failure — callers
 *          should treat the screenshot as "best effort" and proceed without it.
 */
export async function prepareScreenshotForAI(
  src: string,
  maxSlices: number = DEFAULT_MAX_SLICES
): Promise<string[]> {
  if (!src) return [];

  try {
    const img = await loadImage(src);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return [];

    // First pass: scale width down to TARGET_WIDTH (never upscale)
    let scale = Math.min(1, TARGET_WIDTH / srcW);

    // If the scaled height would still need more than maxSlices slices,
    // shrink further so everything fits within the slice budget.
    const maxTotalHeight = maxSlices * MAX_SLICE_HEIGHT;
    if (srcH * scale > maxTotalHeight) {
      scale = maxTotalHeight / srcH;
    }

    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));
    const sliceCount = Math.max(1, Math.ceil(outH / MAX_SLICE_HEIGHT));

    const slices: string[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    for (let i = 0; i < sliceCount; i++) {
      const sliceTopOut = i * MAX_SLICE_HEIGHT;
      const sliceHeightOut = Math.min(MAX_SLICE_HEIGHT, outH - sliceTopOut);
      if (sliceHeightOut <= 0) break;

      canvas.width = outW;
      canvas.height = sliceHeightOut;

      // Map output slice back to source coordinates
      const srcTop = sliceTopOut / scale;
      const srcSliceHeight = sliceHeightOut / scale;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, sliceHeightOut);
      ctx.drawImage(
        img,
        0, srcTop, srcW, srcSliceHeight, // source rect
        0, 0, outW, sliceHeightOut       // destination rect
      );

      // toDataURL throws on tainted canvases (CORS-blocked image) — caught below
      slices.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    }

    console.log(
      `Screenshot prepared: ${srcW}x${srcH} → ${slices.length} slice(s) at ${outW}px wide`
    );
    return slices;
  } catch (e) {
    console.warn('Screenshot preparation failed — continuing without visual context:', e);
    return [];
  }
}

/**
 * Split a data URI into the parts the Anthropic API needs.
 */
export function dataUriParts(dataUri: string): { mediaType: string; base64: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}