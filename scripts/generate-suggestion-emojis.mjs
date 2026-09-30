import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const folder = new URL('../public/suggestion-emojis/', import.meta.url);
await mkdir(folder, { recursive: true });
const shapes = {
  alta: '<path fill-rule="evenodd" d="M3 89 13 39h13l10 50H25l-2-11h-9l-2 11Zm13-21h5l-2.5-17Z"/><path d="M39 39h11v40h14v10H39ZM61 39h32v11H83v39H72V50H61Z"/><path fill-rule="evenodd" d="m93 89 10-50h13l10 50h-11l-2-11h-9l-2 11Zm13-21h5l-2.5-17Z"/>',
  bulb: '<path d="M44 88C44 73 26 69 26 48a38 38 0 0 1 76 0c0 21-18 25-18 40ZM46 102h36M54 115h20"/>',
  family: '<circle cx="64" cy="32" r="16"/><path d="M38 102V83a26 26 0 0 1 52 0v19M12 89V76a19 19 0 0 1 19-19m85 32V76a19 19 0 0 0-19-19"/><circle cx="24" cy="32" r="10"/><circle cx="104" cy="32" r="10"/>',
  internal: '<rect x="19" y="18" width="90" height="38" rx="9"/><rect x="19" y="72" width="90" height="38" rx="9"/><path d="M37 37h2m18 0h32M37 91h2m18 0h32"/>',
  ideas: '<path d="m64 15 14 30 34 5-24 24 6 34-30-16-30 16 6-34-24-24 34-5Z"/>',
  bot: '<rect x="20" y="35" width="88" height="69" rx="14"/><path d="M64 35V15M44 60v8m40-8v8M46 86h36M9 57v27m110-27v27"/>',
  other: '<circle cx="64" cy="64" r="46"/><path d="M38 64h1m24 0h1m24 0h1"/>',
};
for (const [name, shape] of Object.entries(shapes)) {
  if (process.argv[2] && process.argv[2] !== name) continue;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="metal" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#fff"/><stop offset=".25" stop-color="#b5bdc9"/><stop offset=".46" stop-color="#f8fcff"/><stop offset=".5" stop-color="#626d80"/><stop offset=".74" stop-color="#d7e0ea"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g fill="none" stroke="#303743" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">${shape}</g><g fill="none" stroke="url(#metal)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  const rendered = name === 'alta' ? svg
    .replace('fill="none" stroke="#303743" stroke-width="14"', 'fill="#303743" stroke="#303743" stroke-width="3"')
    .replace('fill="none" stroke="url(#metal)" stroke-width="9"', 'fill="url(#metal)" stroke="#e7edf5" stroke-width="0.7"') : svg;
  await sharp(Buffer.from(rendered)).png().toFile(fileURLToPath(new URL(`${name}.png`, folder)));
}
if (!process.argv[2]) for (const name of ['arrow', 'clock', 'check', 'cross']) await copyFile(new URL(`../public/rec-emojis/${name}.png`, import.meta.url), new URL(`${name}.png`, folder));
