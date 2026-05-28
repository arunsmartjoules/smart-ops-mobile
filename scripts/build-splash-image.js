#!/usr/bin/env node
/**
 * Builds a device-agnostic JouleOps splash image.
 *
 * Input:  assets/images/Jouleops-spash-screen.png  (1242x2688, solid #E11111 background)
 * Output: assets/images/jouleops-splash.png        (square, transparent background, centered logo+wordmark)
 *
 * The splash screen plugin (resizeMode: "contain" + imageWidth) draws this image
 * at a fixed dp size centered on backgroundColor — so a transparent, square
 * source makes the rendered result identical on every device aspect ratio.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const SRC = path.resolve(__dirname, "../assets/images/Jouleops-spash-screen.png");
const OUT = path.resolve(__dirname, "../assets/images/jouleops-splash.png");

const BG_R = 225;
const BG_G = 17;
const BG_B = 17;

// Max Euclidean distance from background red to pure white in RGB space.
// Pixels at this distance are fully opaque white; pixels at the bg color have alpha 0.
const MAX_DIST = Math.sqrt(
  (255 - BG_R) ** 2 + (255 - BG_G) ** 2 + (255 - BG_B) ** 2
);

// A pixel is "definitely background" only if its alpha contribution would be ~0.
// Used purely to find the content bounding box.
const BBOX_ALPHA_THRESHOLD = 0.08;

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = src;

const whiteAlpha = (r, g, b) => {
  const d = Math.sqrt((r - BG_R) ** 2 + (g - BG_G) ** 2 + (b - BG_B) ** 2);
  return Math.min(1, d / MAX_DIST);
};

const isBg = (r, g, b) => whiteAlpha(r, g, b) < BBOX_ALPHA_THRESHOLD;

let minX = W,
  minY = H,
  maxX = -1,
  maxY = -1;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!isBg(r, g, b)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) {
  throw new Error("No non-background pixels found in source splash.");
}

const contentW = maxX - minX + 1;
const contentH = maxY - minY + 1;
console.log(
  `Detected content bbox: x=[${minX},${maxX}] y=[${minY},${maxY}] (${contentW}x${contentH})`
);

// Pad the content into a square canvas with a comfortable margin.
const margin = Math.round(Math.max(contentW, contentH) * 0.18);
const side = Math.max(contentW, contentH) + margin * 2;
console.log(`Output canvas: ${side}x${side} (margin=${margin}px)`);

const out = new PNG({ width: side, height: side });
// Initialize fully transparent.
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = 0;
  out.data[i + 1] = 0;
  out.data[i + 2] = 0;
  out.data[i + 3] = 0;
}

const offsetX = Math.floor((side - contentW) / 2);
const offsetY = Math.floor((side - contentH) / 2);

for (let y = 0; y < contentH; y++) {
  for (let x = 0; x < contentW; x++) {
    const srcI = ((minY + y) * W + (minX + x)) * 4;
    const r = data[srcI];
    const g = data[srcI + 1];
    const b = data[srcI + 2];
    const dstI = ((offsetY + y) * side + (offsetX + x)) * 4;
    // Re-derive each pixel as pure white with alpha = its visual "whiteness".
    // Antialiased edges blend cleanly into any backgroundColor (no red halos).
    const a = whiteAlpha(r, g, b);
    if (a === 0) continue;
    out.data[dstI] = 255;
    out.data[dstI + 1] = 255;
    out.data[dstI + 2] = 255;
    out.data[dstI + 3] = Math.round(a * 255);
  }
}

fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`Wrote ${OUT}`);
