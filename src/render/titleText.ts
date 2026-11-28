import { BAYER, OUTLINE } from './portrait';

// Words in 1-bit for the title screen (§16.9 step 9). There's no pixel font
// in the game yet (GNU Unifont is still to be checked), so the words are
// drawn small with the browser's own font, cut to pure ink and paper (no
// grey edges), and given the portraits' white outline: a solid ring, then
// rings dithered away to ½, ¼ and ⅛. Shown scaled up by a whole number, it
// reads as a pixel font, in any script the browser can draw (Greek too).

/** The font the words are drawn in, before they're cut to 1-bit: bold, and small enough that every pixel shows. */
export const TITLE_FONT = { size: 13, family: "Chicago, ChicagoFLF, Geneva, Verdana, 'Segoe UI', sans-serif" };

const RINGS = OUTLINE.solid + OUTLINE.fade.length;

/** Words as a 1-bit picture with its outline, at native size. Transparent outside the outline. */
export function titleWords(text: string, size = TITLE_FONT.size): HTMLCanvasElement {
  const font = `bold ${size}px ${TITLE_FONT.family}`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const pad = RINGS + 1;
  const w = Math.max(1, Math.ceil(probe.measureText(text).width)) + pad * 2;
  const h = Math.ceil(size * 1.5) + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = '#000';
  g.fillText(text, pad, h / 2);
  const img = g.getImageData(0, 0, w, h);
  const px = img.data;
  // ink wherever the browser drew more than half a pixel
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  // the outline: grow the letters a ring at a time (up, down, left, right, so corners come out rounded)
  let solid = ink.slice();
  const ring = new Uint8Array(w * h);
  for (let r = 1; r <= RINGS; r++) {
    const next = solid.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
          next[i] = 1;
          ring[i] = r;
        }
      }
    }
    solid = next;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = ring[i];
      const paper = !ink[i] && r > 0 && (r <= OUTLINE.solid || BAYER[(y % 4) * 4 + (x % 4)] < OUTLINE.fade[r - OUTLINE.solid - 1] * 16);
      const v = ink[i] ? 0 : 255;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = ink[i] || paper ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
