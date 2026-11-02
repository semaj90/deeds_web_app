/**
 * Source-art 48x40 pixel book renderer.
 * Pure drawing functions; no DOM, timers, or Svelte imports.
 */
export type BookMode = 'auto' | 'open' | 'closed';
export type FrameType = 'closed' | 'half' | 'open-0' | 'open-1' | 'open-2' | 'open-3';
export type Frame = { type: FrameType; label: string };

const palette = {
  outline: '#1e0938', coverDark: '#581c87', coverMid: '#7e22ce',
  coverLight: '#a855f7', goldDark: '#b45309', goldBright: '#facc15',
  goldLight: '#fef08a', pageShadow: '#d97706', pageMid: '#fde68a',
  pageLight: '#fffbeb', runeInk: '#7e22ce', runeGlow: '#d8b4fe',
  ribbon: '#ef4444', ribbonDark: '#991b1b'
} as const;

const autoSequence: readonly Frame[] = [
  { type: 'closed', label: 'STATE: BOOK CLOSED' },
  { type: 'closed', label: 'STATE: BOOK CLOSED' },
  { type: 'half', label: 'STATE: BOOK OPENING' },
  { type: 'open-0', label: 'STATE: BOOK OPEN' },
  { type: 'open-1', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-2', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-3', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-0', label: 'STATE: BOOK OPEN' },
  { type: 'open-1', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-2', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-3', label: 'STATE: PAGE FLIPPING' },
  { type: 'open-0', label: 'STATE: BOOK OPEN' },
  { type: 'half', label: 'STATE: BOOK CLOSING' }
];

export function frameAt(mode: BookMode, tick: number): Frame {
  if (mode === 'closed') return { type: 'closed', label: 'STATE: BOOK CLOSED' };
  if (mode === 'open') {
    const stage = tick % 4;
    return { type: `open-${stage}` as FrameType,
      label: stage === 0 ? 'STATE: BOOK OPEN' : 'STATE: PAGE FLIPPING' };
  }
  return autoSequence[tick % autoSequence.length];
}

export function drawBookFrame(ctx: CanvasRenderingContext2D, type: FrameType, tick: number): void {
  ctx.clearRect(0, 0, 48, 40);
  ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };
  const yBob = Math.floor(tick / 2) % 2 === 0 ? 0 : -1;
  const p = palette;

  if (type === 'closed') {
    const x = 12, y = 6 + yBob;
    px(x, y, 24, 28, p.outline);
    px(x + 1, y + 1, 4, 26, p.coverDark);
    px(x + 2, y + 2, 1, 24, p.coverLight);
    px(x + 1, y + 4, 4, 2, p.goldBright);
    px(x + 1, y + 21, 4, 2, p.goldBright);
    px(x + 5, y + 1, 18, 24, p.coverMid);
    px(x + 6, y + 2, 16, 1, p.coverLight);
    px(x + 21, y + 2, 2, 22, p.coverDark);
    px(x + 20, y + 1, 3, 3, p.goldBright);
    px(x + 20, y + 22, 3, 3, p.goldBright);
    px(x + 10, y + 7, 8, 10, p.outline);
    px(x + 11, y + 8, 6, 8, p.goldBright);
    px(x + 12, y + 9, 4, 6, p.coverMid);
    px(x + 13, y + 10, 2, 4, p.runeGlow);
    px(x + 3, y + 25, 19, 2, p.pageLight);
    px(x + 4, y + 26, 18, 1, p.pageShadow);
    px(x + 22, y + 11, 3, 5, p.outline);
    px(x + 22, y + 12, 2, 3, p.goldBright);
    px(x + 12, y + 27, 3, 4, p.ribbon);
    px(x + 12, y + 30, 1, 1, p.ribbonDark);
    px(x + 14, y + 30, 1, 1, p.ribbonDark);
    return;
  }

  if (type === 'half') {
    const x = 8, y = 7 + yBob;
    px(x + 4, y + 2, 12, 23, p.outline);
    px(x + 16, y + 2, 12, 23, p.outline);
    px(x + 5, y + 3, 10, 20, p.coverMid);
    px(x + 17, y + 3, 10, 20, p.coverDark);
    px(x + 7, y + 1, 9, 20, p.pageLight);
    px(x + 16, y + 1, 9, 20, p.pageMid);
    px(x + 15, y + 2, 2, 22, p.outline);
    px(x + 15, y + 23, 2, 3, p.goldBright);
    px(x + 4, y + 2, 3, 3, p.goldBright);
    px(x + 25, y + 2, 3, 3, p.goldBright);
    px(x + 9, y + 5, 5, 1, p.runeInk);
    px(x + 9, y + 8, 4, 1, p.runeInk);
    px(x + 9, y + 11, 5, 1, p.runeInk);
    px(x + 18, y + 5, 5, 1, p.runeInk);
    px(x + 18, y + 8, 4, 1, p.runeInk);
    px(x + 18, y + 11, 5, 1, p.runeInk);
    return;
  }

  const x = 4, y = 8 + yBob;
  px(x, y + 2, 40, 22, p.outline);
  px(x + 2, y, 17, 22, p.outline);
  px(x + 21, y, 17, 22, p.outline);
  px(x + 1, y + 3, 38, 20, p.coverMid);
  px(x + 1, y + 21, 38, 2, p.coverDark);
  px(x + 1, y + 3, 2, 2, p.goldBright);
  px(x + 37, y + 3, 2, 2, p.goldBright);
  px(x + 1, y + 20, 2, 2, p.goldBright);
  px(x + 37, y + 20, 2, 2, p.goldBright);
  px(x + 3, y + 19, 16, 2, p.pageShadow);
  px(x + 21, y + 19, 16, 2, p.pageShadow);
  px(x + 3, y + 18, 16, 1, p.pageMid);
  px(x + 21, y + 18, 16, 1, p.pageMid);
  px(x + 3, y + 1, 16, 17, p.pageLight);
  px(x + 21, y + 1, 16, 17, p.pageLight);
  px(x + 18, y + 1, 1, 17, p.pageMid);
  px(x + 21, y + 1, 1, 17, p.pageMid);
  px(x + 19, y + 2, 2, 21, p.outline);
  px(x + 5, y + 3, 5, 5, p.runeInk);
  px(x + 6, y + 4, 3, 3, p.runeGlow);
  px(x + 11, y + 4, 6, 1, p.runeInk);
  px(x + 11, y + 6, 5, 1, p.runeInk);
  px(x + 5, y + 10, 12, 1, p.runeInk);
  px(x + 5, y + 12, 10, 1, p.runeInk);
  px(x + 5, y + 14, 11, 1, p.runeInk);
  px(x + 23, y + 4, 11, 1, p.runeInk);
  px(x + 23, y + 6, 9, 1, p.runeInk);
  px(x + 23, y + 9, 12, 1, p.runeInk);
  px(x + 23, y + 11, 8, 1, p.runeInk);
  px(x + 23, y + 14, 10, 1, p.runeInk);
  px(x + 19, y + 23, 3, 5, p.ribbon);
  px(x + 19, y + 27, 1, 1, p.ribbonDark);
  px(x + 21, y + 27, 1, 1, p.ribbonDark);

  const flip = Number(type.substring(5));
  if (flip === 1) {
    px(x + 21, y - 1, 11, 16, p.outline);
    px(x + 21, y, 10, 15, p.pageLight);
    px(x + 23, y + 3, 6, 1, p.runeGlow);
    px(x + 23, y + 6, 5, 1, p.runeInk);
    px(x + 23, y + 9, 6, 1, p.runeInk);
  } else if (flip === 2) {
    px(x + 17, y - 4, 6, 19, p.outline);
    px(x + 18, y - 3, 4, 17, p.pageLight);
    px(x + 19, y - 1, 2, 12, p.pageMid);
  } else if (flip === 3) {
    px(x + 8, y - 1, 11, 16, p.outline);
    px(x + 9, y, 10, 15, p.pageLight);
    px(x + 11, y + 3, 6, 1, p.runeGlow);
    px(x + 11, y + 6, 5, 1, p.runeInk);
    px(x + 11, y + 9, 6, 1, p.runeInk);
  }
}
