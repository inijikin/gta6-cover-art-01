// The cover's state: everything the renderer needs, nothing it does not.
// Photos live in a registry keyed by id (their Image objects are not part of
// the serialised state, so undo snapshots stay plain JSON).
import { LAYOUTS } from './layouts.js';

export const EXPORT_SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Landscape 1920 x 1080' },
};

export const CAPTION_GRADIENTS = {
  sunset: { name: 'Sunset', stops: ['#ffe259', '#ff7e3d', '#ff2e88', '#b04dff'] },
  neon: { name: 'Neon', stops: ['#8ef6ff', '#00d5ff', '#ff5ce1', '#ff2fb3'] },
  gold: { name: 'Gold', stops: ['#fff3b0', '#ffd166', '#f4842c'] },
  ice: { name: 'Ice', stops: ['#ffffff', '#bfe9ff', '#5aa9ff'] },
};

export const LOOKS = {
  'sunset-drive': {
    name: 'Sunset Drive',
    blurb: 'Vice Sunset grade, sunset letters, warm grain.',
    grade: 'vice-sunset',
    gradient: 'sunset',
    grain: 0.28,
    halftone: false,
    vignette: 0.38,
  },
  'neon-nights': {
    name: 'Neon Nights',
    blurb: 'Neon grade, neon letters, script subtitle.',
    grade: 'neon',
    gradient: 'neon',
    grain: 0.2,
    halftone: true,
    vignette: 0.45,
  },
  'duotone-vice': {
    name: 'Duotone Vice',
    blurb: 'Two-ink duotone, gold letters, hard vignette.',
    grade: 'duotone',
    gradient: 'gold',
    grain: 0.32,
    halftone: true,
    vignette: 0.5,
  },
  'noir-coast': {
    name: 'Noir Coast',
    blurb: 'Black and white, ice letters, quiet grain.',
    grade: 'noir',
    gradient: 'ice',
    grain: 0.35,
    halftone: false,
    vignette: 0.55,
  },
};

export const LOOK_IDS = Object.keys(LOOKS);

/** A fresh panel for a layout slot: photo by round-robin, gentle zoom, fit fill. */
export function defaultPanel(photoId, index) {
  return {
    photoId,
    zoom: 1,
    panX: 0.5,
    panY: 0.5,
    fit: 'fill',
    grade: 'vice-sunset',
    intensity: 0.85,
  };
}

/** Panels for a layout, keeping the old assignments where the slot still exists. */
export function panelsForLayout(layoutId, oldPanels, photoIds) {
  const count = LAYOUTS[layoutId].panels.length;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const old = oldPanels[i];
    const photoId = old && old.photoId ? old.photoId : photoIds[i % Math.max(photoIds.length, 1)] ?? null;
    out.push(old ? { ...old, photoId } : defaultPanel(photoId, i));
  }
  return out;
}

export function defaultState() {
  return {
    layout: 'hero-left',
    size: '1920x1080',
    panels: [],
    caption: {
      text: 'SUNSET HEIST',
      sub: 'welcome to the coast',
      size: 1,
      spacing: 0.06,
      gradient: 'sunset',
      outline: true,
      shadow: true,
      position: 'bottom',
    },
    badge: { text: 'VICE CITY', show: true },
    effects: { grain: 0.28, halftone: false, vignette: 0.38 },
    look: 'sunset-drive',
  };
}

/** Applies a one-click look: grade per panel, caption gradient, effects. */
export function applyLook(state, lookId) {
  const look = LOOKS[lookId];
  if (!look) return state;
  const next = structuredClone(state);
  next.look = lookId;
  next.panels = next.panels.map((p) => ({ ...p, grade: look.grade }));
  next.caption.gradient = look.gradient;
  next.effects = { grain: look.grain, halftone: look.halftone, vignette: look.vignette };
  return next;
}

/** Plain-JSON snapshot for undo (photos are registry ids, never Image objects). */
export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

/** A small undo/redo stack over state snapshots. */
export class CoverHistory {
  constructor(initial) {
    this.past = [];
    this.future = [];
    this.present = snapshot(initial);
  }

  commit(next) {
    this.past.push(this.present);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    this.present = snapshot(next);
  }

  undo() {
    if (!this.past.length) return null;
    this.future.push(this.present);
    this.present = this.past.pop();
    return snapshot(this.present);
  }

  redo() {
    if (!this.future.length) return null;
    this.past.push(this.present);
    this.present = this.future.pop();
    return snapshot(this.present);
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
