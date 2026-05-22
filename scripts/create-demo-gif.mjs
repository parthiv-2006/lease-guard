// Creates an animated demo GIF from the captured screenshots.
// Run AFTER capture-screenshots.mjs: node scripts/create-demo-gif.mjs
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '../.github/assets');
const OUT = path.join(ASSETS, 'demo.gif');

const W = 1280;
const H = 800;

const FRAMES = [
  { file: 'landing.png',               delay: 220 },
  { file: 'report-overview.png',       delay: 280 },
  { file: 'report-red-flags.png',      delay: 260 },
  { file: 'report-clause-explorer.png', delay: 260 },
  { file: 'report-negotiation.png',    delay: 260 },
  { file: 'report-agent-trace.png',    delay: 300 },
];

const N = FRAMES.length;

// 1. Resize every frame to the same W×H, get raw RGB pixels.
const rawFrames = await Promise.all(
  FRAMES.map(({ file }) =>
    sharp(path.join(ASSETS, file))
      .resize(W, H, { fit: 'cover', position: 'top' })
      .removeAlpha()
      .raw()
      .toBuffer()
  )
);

// 2. Stack all frames into a single W × (H*N) filmstrip buffer.
//    sharp treats a tall image with `pages` set as a multi-page (animated) image.
const filmstrip = Buffer.concat(rawFrames);

// 3. Output as animated GIF. `delay` is per-frame in ms (array or scalar).
await sharp(filmstrip, {
  raw: { width: W, height: H * N, channels: 3 },
})
  .gif({
    loop: 0,                          // loop forever
    delay: FRAMES.map(f => f.delay),  // per-frame delays
  })
  .toFile(OUT);

// 4. Verify
const meta = await sharp(OUT, { animated: true }).metadata();
console.log(`Saved ${OUT}`);
console.log(`  format: ${meta.format}  |  pages: ${meta.pages}  |  size: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
