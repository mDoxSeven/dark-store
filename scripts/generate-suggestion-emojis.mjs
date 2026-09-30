import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const folder = new URL('../public/suggestion-emojis/', import.meta.url);
await mkdir(folder, { recursive: true });
const shapes = {
  alta: '<path d="M24 105 64 22l40 83M41 76h46"/><path d="m22 26 6 8 6-8m60 0 6 8 6-8"/>',
  bulb: '<path d="M44 88C44 73 26 69 26 48a38 38 0 0 1 76 0c0 21-18 25-18 40ZM46 102h36M54 115h20"/>',
  family: '<circle cx="64" cy="32" r="16"/><path d="M38 102V83a26 26 0 0 1 52 0v19M12 89V76a19 19 0 0 1 19-19m85 32V76a19 19 0 0 0-19-19"/><circle cx="24" cy="32" r="10"/><circle cx="104" cy="32" r="10"/>',
  internal: '<rect x="19" y="18" width="90" height="38" rx="9"/><rect x="19" y="72" width="90" height="38" rx="9"/><path d="M37 37h2m18 0h32M37 91h2m18 0h32"/>',
  ideas: '<path d="m64 15 14 30 34 5-24 24 6 34-30-16-30 16 6-34-24-24 34-5Z"/>',
  bot: '<rect x="20" y="35" width="88" height="69" rx="14"/><path d="M64 35V15M44 60v8m40-8v8M46 86h36M9 57v27m110-27v27"/>',
  other: '<circle cx="64" cy="64" r="46"/><path d="M38 64h1m24 0h1m24 0h1"/>',
};
for (const [name, shape] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="metal" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#fff"/><stop offset=".25" stop-color="#b5bdc9"/><stop offset=".46" stop-color="#f8fcff"/><stop offset=".5" stop-color="#626d80"/><stop offset=".74" stop-color="#d7e0ea"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g fill="none" stroke="#303743" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">${shape}</g><g fill="none" stroke="url(#metal)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(`${name}.png`, folder)));
}
for (const name of ['arrow', 'clock', 'check', 'cross']) await copyFile(new URL(`../public/rec-emojis/${name}.png`, import.meta.url), new URL(`${name}.png`, folder));
