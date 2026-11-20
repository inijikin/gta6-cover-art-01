// The cover renderer: draws the whole poster — panels, grades, caption, badge,
// grain, halftone and vignette — onto any 2D canvas at any size. Everything is
// deterministic (seeded grain), so the same state always paints the same cover.
import { LAYOUTS, panelBounds } from './layouts.js';
import { GRADES, applyDuotone, angledGradient } from './grades.js';
import { CAPTION_GRADIENTS } from './state.js';

const GRAIN_SEED = 20261120;

/** Seeded PRNG (mulberry32) so the grain tile never changes between renders. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grainCache = new Map();

/** A tileable grey-noise canvas, one per size, built once from a fixed seed. */
export function grainTile(size) {
  if (grainCache.has(size)) return grainCache.get(size);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(GRAIN_SEED + size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCache.set(size, tile);
  return tile;
}

const halftoneCache = new Map();

/** A dot grid pattern for the halftone title block. */
export function halftoneTile(size) {
  if (halftoneCache.has(size)) return halftoneCache.get(size);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  halftoneCache.set(size, tile);
  return tile;
}

/** Pixel rects (and polygon points) of every panel for drawing and hit-testing. */
export function computePanelRects(state, W, H) {
  const layout = LAYOUTS[state.layout];
  const gutter = Math.max(2, Math.round(Math.min(W, H) * 0.012));
  return layout.panels.map((panel, index) => {
    const b = panelBounds(panel);
    const inset = layout.polaroid ? 0 : gutter / 2;
    const rect = {
      index,
      x: Math.round((b.x * W + inset) * 10) / 10,
      y: Math.round((b.y * H + inset) * 10) / 10,
      w: Math.round((b.w * W - inset * 2) * 10) / 10,
      h: Math.round((b.h * H - inset * 2) * 10) / 10,
      rotate: panel.rotate ?? 0,
      polaroid: Boolean(layout.polaroid),
      points: panel.points
        ? panel.points.map(([px, py]) => [px * W, py * H])
        : null,
    };
    return rect;
  });
}

/** Which panel (index) sits under point (x, y), topmost first, or -1. */
export function panelAtPoint(rects, x, y) {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    let px = x;
    let py = y;
    if (r.rotate) {
      const rad = (-r.rotate * Math.PI) / 180;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const dx = x - cx;
      const dy = y - cy;
      px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    if (r.points) {
      if (pointInPolygon(px, py, r.points)) return i;
    } else if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      return i;
    }
  }
  return -1;
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Clips the context to a panel's shape (rect, polygon, or rotated rect). */
export function clipPanel(ctx, rect) {
  ctx.save();
  if (rect.rotate) {
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate((rect.rotate * Math.PI) / 180);
    ctx.translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
  }
  ctx.beginPath();
  if (rect.points) {
    rect.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
  } else {
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.clip();
}

/** Cover/fit math: where the photo lands inside a panel rect, given pan + zoom. */
export function photoPlacement(img, rect, panel) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = panel.fit === 'fit'
    ? Math.min(rect.w / iw, rect.h / ih)
    : Math.max(rect.w / iw, rect.h / ih);
  const scale = base * panel.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const ox = (panel.panX - 0.5) * 2 * slackX;
  const oy = (panel.panY - 0.5) * 2 * slackY;
  return { x: rect.x + (rect.w - dw) / 2 - ox, y: rect.y + (rect.h - dh) / 2 - oy, w: dw, h: dh };
}

/** Renders one panel's photo through its grade onto an offscreen canvas. */
export function gradePanelImage(img, rect, panel) {
  const grade = GRADES[panel.grade] ?? GRADES['vice-sunset'];
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  const place = photoPlacement(img, { x: 0, y: 0, w, h }, panel);
  ctx.filter = grade.filter;
  ctx.drawImage(img, place.x, place.y, place.w, place.h);
  ctx.filter = 'none';
  const strength = panel.intensity;
  for (const overlay of grade.overlays) {
    ctx.save();
    ctx.globalAlpha = overlay.alpha * strength;
    ctx.globalCompositeOperation = overlay.blend;
    if (overlay.kind === 'linear') {
      ctx.fillStyle = angledGradient(ctx, { x: 0, y: 0, w, h }, overlay.from, overlay.to, overlay.angle);
    } else {
      ctx.fillStyle = overlay.color;
    }
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (grade.duotone) {
    const data = ctx.getImageData(0, 0, w, h);
    applyDuotone(data, grade.duotone[0], grade.duotone[1], 0.55 + 0.45 * strength);
    ctx.putImageData(data, 0, 0);
  }
  return off;
}

/** Draws text with manual letter spacing, centred on (cx, y) as a baseline. */
export function drawSpacedText(ctx, text, cx, y, spacingPx) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacingPx * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacingPx;
  });
  ctx.textAlign = prevAlign;
  return total;
}

/** Same as drawSpacedText but stroked (for the caption outline pass). */
export function strokeSpacedText(ctx, text, cx, y, spacingPx) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacingPx * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.strokeText(ch, x, y);
    x += widths[i] + spacingPx;
  });
  ctx.textAlign = prevAlign;
  return total;
}

/** Measures the spaced width of a string at the current font. */
export function spacedWidth(ctx, text, spacingPx) {
  return [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0)
    + spacingPx * Math.max(0, text.length - 1);
}

/** The caption block: scrim, big gradient title, script sub-caption, badge. */
export function drawCaption(ctx, state, W, H) {
  const cap = state.caption;
  const text = (cap.text || '').trim().toUpperCase();
  if (!text && !state.badge.show) return;
  const pos = cap.position;
  const bandH = H * 0.34;
  const bandY = pos === 'top' ? 0 : pos === 'middle' ? (H - bandH) / 2 : H - bandH;

  // Scrim so letters stay readable over any photo.
  if (text) {
    const scrim = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    if (pos === 'top') {
      scrim.addColorStop(0, 'rgba(10, 3, 22, 0.62)');
      scrim.addColorStop(1, 'rgba(10, 3, 22, 0)');
    } else {
      scrim.addColorStop(0, 'rgba(10, 3, 22, 0)');
      scrim.addColorStop(1, 'rgba(10, 3, 22, 0.62)');
    }
    ctx.fillStyle = scrim;
    ctx.fillRect(0, bandY, W, bandH);
  }

  // Halftone dots inside the caption band, poster-print feel.
  if (state.effects.halftone && text) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandY, W, bandH);
    ctx.clip();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = ctx.createPattern(halftoneTile(Math.max(6, Math.round(H * 0.012))), 'repeat');
    ctx.fillRect(0, bandY, W, bandH);
    ctx.restore();
  }

  if (text) {
    const spacing = H * 0.012 * (1 + cap.spacing * 8);
    let size = H * 0.115 * cap.size;
    ctx.font = `${size}px Anton, 'Archivo Black', sans-serif`;
    while (spacedWidth(ctx, text, spacing) > W * 0.92 && size > 18) {
      size -= 2;
      ctx.font = `${size}px Anton, 'Archivo Black', sans-serif`;
    }
    const baseline = pos === 'top' ? bandY + size * 1.05 : pos === 'middle' ? H / 2 + size * 0.3 : H - H * 0.055;
    const grad = ctx.createLinearGradient(0, baseline - size, 0, baseline + size * 0.12);
    const stops = CAPTION_GRADIENTS[cap.gradient]?.stops ?? CAPTION_GRADIENTS.sunset.stops;
    stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));
    ctx.save();
    if (cap.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = size * 0.16;
      ctx.shadowOffsetY = size * 0.045;
    }
    if (cap.outline) {
      ctx.lineWidth = Math.max(2, size * 0.085);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#160a2e';
      ctx.font = `${size}px Anton, 'Archivo Black', sans-serif`;
      strokeSpacedText(ctx, text, W / 2, baseline, spacing);
    }
    ctx.fillStyle = grad;
    ctx.font = `${size}px Anton, 'Archivo Black', sans-serif`;
    drawSpacedText(ctx, text, W / 2, baseline, spacing);
    ctx.restore();

    // Script sub-caption, tucked under (or over) the title.
    if (cap.sub && cap.sub.trim()) {
      const subSize = Math.max(14, size * 0.34);
      ctx.font = `${subSize}px Pacifico, cursive`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = subSize * 0.2;
      const subY = pos === 'top' ? baseline + subSize * 1.5 : baseline - size * 1.28;
      ctx.fillText(cap.sub.trim(), W / 2, subY);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }
  }

  // Location badge, top-right pill.
  if (state.badge.show && state.badge.text.trim()) {
    const label = state.badge.text.trim().toUpperCase();
    const fontPx = Math.max(13, Math.round(H * 0.024));
    ctx.font = `400 ${fontPx}px 'Archivo Black', sans-serif`;
    const tw = ctx.measureText(label).width;
    const padX = fontPx * 0.9;
    const padY = fontPx * 0.55;
    const bw = tw + padX * 2;
    const bh = fontPx + padY * 2;
    const bx = W - bw - W * 0.025;
    const by = H * 0.025;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 4, 24, 0.58)';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = Math.max(1.5, fontPx * 0.09);
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + fontPx * 0.04);
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The full cover: background glow, panels, caption, grain, vignette. */
export function drawCover(canvas, state, photos, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#160a2e';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.08, 0, W * 0.82, H * 0.08, Math.max(W, H) * 0.75);
  glow.addColorStop(0, 'rgba(255, 94, 120, 0.22)');
  glow.addColorStop(0.55, 'rgba(176, 77, 255, 0.08)');
  glow.addColorStop(1, 'rgba(22, 10, 46, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const rects = computePanelRects(state, W, H);
  const layout = LAYOUTS[state.layout];
  rects.forEach((rect) => {
    const panel = state.panels[rect.index];
    const photo = panel && panel.photoId ? photos.get(panel.photoId) : null;
    if (rect.polaroid) {
      // White polaroid frame behind the photo, with a deeper foot.
      const frame = Math.round(Math.min(rect.w, rect.h) * 0.045);
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate((rect.rotate * Math.PI) / 180);
      ctx.fillStyle = '#fdf8ef';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = Math.round(Math.min(W, H) * 0.02);
      ctx.shadowOffsetY = Math.round(Math.min(W, H) * 0.008);
      ctx.fillRect(-rect.w / 2 - frame, -rect.h / 2 - frame, rect.w + frame * 2, rect.h + frame * 2 + frame * 1.6);
      ctx.restore();
    }
    if (!photo || !panel) {
      // Empty panel: dark checker placeholder with a plus.
      clipPanel(ctx, rect);
      ctx.fillStyle = '#241640';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = Math.max(1, Math.min(rect.w, rect.h) * 0.02);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const arm = Math.min(rect.w, rect.h) * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy);
      ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm);
      ctx.lineTo(cx, cy + arm);
      ctx.stroke();
      ctx.restore();
    } else {
      const graded = gradePanelImage(photo, rect, panel);
      clipPanel(ctx, rect);
      ctx.drawImage(graded, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
      ctx.save();
      if (rect.rotate) {
        ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
        ctx.rotate((rect.rotate * Math.PI) / 180);
        ctx.translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
      }
      ctx.strokeStyle = 'rgba(10, 3, 22, 0.5)';
      ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.004);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  });

  drawCaption(ctx, state, W, H);

  // Film grain, seeded so it never changes between renders.
  if (state.effects.grain > 0) {
    ctx.save();
    ctx.globalAlpha = state.effects.grain * 0.45;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(grainTile(160), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Vignette: darkened corners, poster depth.
  if (state.effects.vignette > 0) {
    const vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vig.addColorStop(0, 'rgba(8, 3, 18, 0)');
    vig.addColorStop(1, `rgba(8, 3, 18, ${0.55 * state.effects.vignette})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Editor selection highlight (preview only, never in an export).
  if (opts.highlight != null && rects[opts.highlight]) {
    const r = rects[opts.highlight];
    ctx.save();
    ctx.strokeStyle = '#ff2e88';
    ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.006);
    ctx.setLineDash([Math.max(6, W * 0.008), Math.max(4, W * 0.005)]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  return rects;
}

/** Renders the state to a fresh canvas at the given size (used for export). */
export function renderCoverToCanvas(state, photos, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCover(canvas, state, photos, {});
  return canvas;
}
