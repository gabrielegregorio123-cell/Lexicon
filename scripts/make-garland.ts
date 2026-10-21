/**
 * Generates public/brand/garland-tile.svg: one seamless tile of a stylised serpent body, drawn as a
 * fine gold outline with a dotted spine and scale chevrons. The site repeats it vertically
 * (and scrolls it with the page), so the serpent seems to continue forever in both directions.
 *   npx tsx scripts/make-garland.ts
 *
 * Seamless by construction: every quantity is periodic in y with a period that divides the
 * tile height, and the body is drawn beyond the tile edges and clipped by the viewBox.
 */
import fs from 'node:fs';

const W = 120;
const PERIOD = 260; // one full S-wave
const H = PERIOD * 3; // tile height: three waves
const GOLD = '#a98a3d';
const SWING = 30;
const BODY = 24; // outer width of the body
const RIM = 5; // thickness of the outline
const STEP = 4;

const centre = (y: number) => W / 2 + SWING * Math.sin((2 * Math.PI * y) / PERIOD);

const pts: Array<{ x: number; y: number; nx: number; ny: number }> = [];
for (let y = -80; y <= H + 80; y += STEP) {
  const dx = centre(y + 1) - centre(y - 1);
  const len = Math.hypot(dx, 2);
  pts.push({ x: centre(y), y, nx: 2 / len, ny: -dx / len });
}

const ring = (w: number): string => {
  const f = (n: number) => n.toFixed(1);
  const left = pts.map((p) => `${f(p.x + (p.nx * w) / 2)},${f(p.y + (p.ny * w) / 2)}`);
  const right = pts.map((p) => `${f(p.x - (p.nx * w) / 2)},${f(p.y - (p.ny * w) / 2)}`).reverse();
  return `M${[...left, ...right].join('L')}Z`;
};

// dotted spine and scale chevrons, on a spacing that divides the tile height
const DOT = 13; // H / DOT must be an integer
const CHEVRON = 26; // H / CHEVRON must be an integer
const at = (y: number) => {
  const dx = centre(y + 1) - centre(y - 1);
  const len = Math.hypot(dx, 2);
  return { x: centre(y), nx: 2 / len, ny: -dx / len };
};
let dots = '';
for (let y = -DOT; y <= H + DOT; y += DOT) dots += `<circle cx="${at(y).x.toFixed(1)}" cy="${y}" r="2"/>`;
let chevrons = '';
for (let y = -CHEVRON; y <= H + CHEVRON; y += CHEVRON) {
  const c = at(y + CHEVRON / 2);
  const yy = y + CHEVRON / 2;
  const a = (BODY - RIM * 2) / 2.6;
  const tx = -c.ny;
  const ty = c.nx;
  const pt = (k: number, dy: number) => `${(c.x + c.nx * a * k - tx * dy).toFixed(1)},${(yy + c.ny * a * k - ty * dy).toFixed(1)}`;
  chevrons += `<path d="M${pt(1, 4)}L${pt(0, -3)}L${pt(-1, 4)}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
  <path fill="${GOLD}" fill-rule="evenodd" d="${ring(BODY)}${ring(BODY - RIM * 2)}"/>
  <g fill="${GOLD}">${dots}</g>
  <g stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85">${chevrons}</g>
</svg>
`;
fs.writeFileSync('public/brand/garland-tile.svg', svg);
console.log(`garland-tile.svg: ${W}×${H}, ${(svg.length / 1024).toFixed(1)} KB`);
