/**
 * Generates public/brand/garland.svg: a stylised serpent, drawn as a fine gold outline with a
 * dotted spine and scale chevrons, meant to run down the left side of the site as a watermark.
 *   npx tsx scripts/make-garland.ts
 */
import fs from 'node:fs';

const W = 120;
const H = 1100;
const GOLD = '#a98a3d';
const STEP = 4; // sampling step along the body

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Centre line: a calm S-wave whose swing grows a little towards the middle. */
const centre = (y: number) => {
  const swing = 24 + 10 * Math.sin((Math.PI * y) / H);
  return W / 2 + swing * Math.sin((2 * Math.PI * y) / 270 + 0.55);
};

/** Body width: rounded at the head, full through the body, tapering to a point at the tail. */
const width = (y: number) => {
  const head = smooth(Math.min(1, (y - 70) / 90));
  const tail = smooth(Math.min(1, (H - 20 - y) / 300));
  return 8 + 17 * Math.min(head, tail);
};

const pts: Array<{ x: number; y: number; w: number; nx: number; ny: number }> = [];
for (let y = 64; y <= H - 20; y += STEP) {
  const x = centre(y);
  const dx = centre(y + 1) - centre(y - 1);
  const len = Math.hypot(dx, 2);
  pts.push({ x, y, w: width(y), nx: 2 / len, ny: -dx / len });
}

const ring = (inset: number): string => {
  const usable = pts.filter((p) => p.w - inset > 1);
  const left = usable.map((p) => `${(p.x + (p.nx * (p.w - inset)) / 2).toFixed(1)},${(p.y + (p.ny * (p.w - inset)) / 2).toFixed(1)}`);
  const right = usable.map((p) => `${(p.x - (p.nx * (p.w - inset)) / 2).toFixed(1)},${(p.y - (p.ny * (p.w - inset)) / 2).toFixed(1)}`).reverse();
  return `M${[...left, ...right].join('L')}Z`;
};

const first = pts[0];
// head: a small rounded wedge leaning left, with a forked tongue
const hx = first.x;
const hy = first.y;
const head = `M${hx - 9},${hy + 6} C${hx - 12},${hy - 14} ${hx - 2},${hy - 34} ${hx - 18},${hy - 44} C${hx - 30},${hy - 36} ${hx - 34},${hy - 14} ${hx + 9},${hy + 6} Z`;
const tongue = `M${hx - 20},${hy - 44} L${hx - 26},${hy - 60} M${hx - 26},${hy - 60} L${hx - 31},${hy - 68} M${hx - 26},${hy - 60} L${hx - 22},${hy - 70}`;

const dots = pts
  .filter((_, i) => i % 4 === 0 && pts[i].w > 9)
  .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"/>`)
  .join('');

// a fine chevron every so often along the body, like a scale pattern
const chevrons = pts
  .filter((_, i) => i % 14 === 7 && pts[i].w > 12)
  .map((p) => {
    const a = (p.w - 6) / 2.6;
    const tx = -p.ny;
    const ty = p.nx;
    const l = `${(p.x + p.nx * a - tx * 4).toFixed(1)},${(p.y + p.ny * a - ty * 4).toFixed(1)}`;
    const m = `${p.x.toFixed(1)},${(p.y + 3).toFixed(1)}`;
    const r = `${(p.x - p.nx * a - tx * 4).toFixed(1)},${(p.y - p.ny * a - ty * 4).toFixed(1)}`;
    return `<path d="M${l}L${m}L${r}"/>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
  <g fill="${GOLD}" fill-rule="evenodd"><path d="${ring(0)}${ring(5)}"/></g>
  <g fill="${GOLD}">${dots}</g>
  <g stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85">${chevrons}</g>
  <path d="${head}" stroke="${GOLD}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="${hx - 15}" cy="${hy - 24}" r="2" fill="${GOLD}"/>
  <path d="${tongue}" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>
</svg>
`;
fs.writeFileSync('public/brand/garland.svg', svg);
console.log(`garland.svg: ${(svg.length / 1024).toFixed(1)} KB`);
