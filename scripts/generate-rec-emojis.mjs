// Geometric chrome icons: SVG source rasterized to Discord-compatible transparent PNG.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const shapes = {
  clipboard: '<rect x="29" y="25" width="70" height="89" rx="10"/><rect x="46" y="14" width="36" height="22" rx="7"/><path d="M45 53h38M45 71h38M45 89h24"/>',
  arrow: '<path d="m30 30 32 34-32 34m36-68 32 34-32 34"/>',
  dot: '<circle cx="64" cy="64" r="30" fill="url(#metal)"/>',
  check: '<path d="m24 64 26 28 54-60" stroke-width="18"/>',
  cross: '<path d="m32 32 64 64m0-64-64 64" stroke-width="18"/>',
  clock: '<circle cx="64" cy="64" r="46"/><path d="M64 33v32l23 14"/>',
};
await mkdir(new URL('../public/rec-emojis/', import.meta.url), { recursive: true });
for (const [name, shape] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="metal" x1="0" y1="0" x2="0.5" y2="1"><stop stop-color="#fff"/><stop offset=".25" stop-color="#b5bdc9"/><stop offset=".46" stop-color="#f8fcff"/><stop offset=".5" stop-color="#626d80"/><stop offset=".74" stop-color="#d7e0ea"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g fill="none" stroke="#303743" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">${shape}</g><g fill="none" stroke="url(#metal)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(`../public/rec-emojis/${name}.png`, import.meta.url)));
}
