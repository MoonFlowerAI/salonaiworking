/**
 * Embeds an invisible MoonFlower AI watermark into hero images.
 * Run locally: node scripts/watermark.mjs
 * Does NOT run on Railway — sharp is devDependency only.
 */
import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join, extname } from 'path';

const IMAGES_DIR = 'public/images';
const WATERMARK_TEXT = '© MoonFlower AI';
const OPACITY = 0.04; // 4% — invisible to eye, detectable with analysis

const TARGET_FILES = [
  'kampfmonchichi-ai-generated-8329940.jpg',
  'charlvera-ai-generated-7563442.jpg',
  'zameerhaider1-ai-generated-8482996.jpg',
  'amrita-art-ai-generated-8441554.jpg',
  'miperrorubi-ai-generated-9000762.jpg',
];

async function buildWatermarkSvg(width, height) {
  const fontSize = Math.round(Math.min(width, height) * 0.035);
  const lines = [];
  const cols = Math.ceil(width / 280);
  const rows = Math.ceil(height / 120);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = c * 280 - 40;
      const y = r * 120 + 60;
      lines.push(
        `<text x="${x}" y="${y}" transform="rotate(-28,${x},${y})">${WATERMARK_TEXT}</text>`
      );
    }
  }
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text {
          font-family: Arial, sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          fill: white;
          fill-opacity: ${OPACITY};
        }
      </style>
      ${lines.join('\n')}
    </svg>`);
}

async function watermark(filename) {
  const input = join(IMAGES_DIR, filename);
  const meta = await sharp(input).metadata();
  const { width, height } = meta;
  const svg = await buildWatermarkSvg(width, height);

  await sharp(input)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(input + '.wm.jpg');

  // Overwrite original
  const { rename } = await import('fs/promises');
  await rename(input, input + '.bak');
  await rename(input + '.wm.jpg', input);

  console.log(`✓ ${filename} (${width}×${height})`);
}

console.log('Watermarking images with invisible © MoonFlower AI...\n');
for (const f of TARGET_FILES) {
  await watermark(f).catch(e => console.error(`✗ ${f}: ${e.message}`));
}
console.log('\nDone. Commit the updated images. Backups saved as .bak files.');
