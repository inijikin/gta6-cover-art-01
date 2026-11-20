// Colour grades for Vice Cover Studio. Each grade is a canvas-filter recipe plus
// a stack of tint overlays, and optionally a duotone map (two colours the
// photo's luminance is remapped between). `intensity` 0..1 scales the overlays
// and the duotone mix, so the same grade can whisper or shout.
export const GRADES = {
  'vice-sunset': {
    name: 'Vice Sunset',
    blurb: 'Warm orange-pink dusk, the coast at golden hour.',
    filter: 'saturate(1.28) contrast(1.08) brightness(1.03)',
    overlays: [
      { kind: 'linear', from: '#ffb347', to: '#ff2e88', angle: 160, blend: 'soft-light', alpha: 0.55 },
      { kind: 'solid', color: '#ff5e78', blend: 'overlay', alpha: 0.12 },
    ],
    duotone: null,
  },
  neon: {
    name: 'Neon Nights',
    blurb: 'Cyan shadows, magenta highlights, wet pavement glow.',
    filter: 'saturate(1.55) contrast(1.12) brightness(1.0)',
    overlays: [
      { kind: 'solid', color: '#00d5ff', blend: 'multiply', alpha: 0.22 },
      { kind: 'solid', color: '#ff2fb3', blend: 'screen', alpha: 0.16 },
      { kind: 'linear', from: '#00e5ff', to: '#ff2fb3', angle: 115, blend: 'soft-light', alpha: 0.35 },
    ],
    duotone: null,
  },
  duotone: {
    name: 'Duotone Vice',
    blurb: 'Deep violet shadows to hot-pink light, two inks only.',
    filter: 'saturate(1.1) contrast(1.18) brightness(1.02)',
    overlays: [],
    duotone: ['#170a33', '#ff5e78'],
  },
  noir: {
    name: 'Noir Coast',
    blurb: 'Black and white, hard contrast, late-night mood.',
    filter: 'grayscale(1) contrast(1.24) brightness(1.04)',
    overlays: [{ kind: 'solid', color: '#8a7bff', blend: 'soft-light', alpha: 0.14 }],
    duotone: null,
  },
  natural: {
    name: 'Natural Light',
    blurb: 'Barely touched: a little punch, colours as shot.',
    filter: 'saturate(1.07) contrast(1.05) brightness(1.01)',
    overlays: [],
    duotone: null,
  },
};

export const GRADE_IDS = Object.keys(GRADES);

/** Remaps an ImageData's luminance between two colours (duotone / noir-safe). */
export function applyDuotone(imageData, fromHex, toHex, mix) {
  const from = hexRgb(fromHex);
  const to = hexRgb(toHex);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    const r = from[0] + (to[0] - from[0]) * lum;
    const g = from[1] + (to[1] - from[1]) * lum;
    const b = from[2] + (to[2] - from[2]) * lum;
    data[i] = data[i] + (r - data[i]) * mix;
    data[i + 1] = data[i + 1] + (g - data[i + 1]) * mix;
    data[i + 2] = data[i + 2] + (b - data[i + 2]) * mix;
  }
  return imageData;
}

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A linear gradient across a rect at `angle` degrees, from `from` to `to`. */
export function angledGradient(ctx, rect, from, to, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = Math.cos(rad) * (rect.w + rect.h) * 0.5;
  const dy = Math.sin(rad) * (rect.w + rect.h) * 0.5;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}
