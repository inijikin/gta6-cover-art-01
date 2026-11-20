// Fixed scenes for screenshots: ?shot=cover shows the cover alone at the
// export size; ?shot=editor shows the editor with photos loaded;
// ?shot=square and ?shot=portrait show the other two post sizes.
// window.__shotReady is set once the scene is painted (fonts included).
import { applyLook, panelsForLayout } from './state.js';

const SAMPLES = [
  { id: 'sample-hero', name: 'Hero — convertible', src: 'samples/hero.jpg' },
  { id: 'sample-boulevard', name: 'Boulevard — sunset', src: 'samples/boulevard.jpg' },
  { id: 'sample-pier', name: 'Pier — fishing', src: 'samples/pier.jpg' },
];

const SCENES = {
  cover: {
    layout: 'hero-left',
    size: '1920x1080',
    caption: 'SUNSET HEIST',
    sub: 'welcome to the coast',
    badge: 'VICE CITY',
    look: 'sunset-drive',
    photos: ['sample-hero', 'sample-boulevard', 'sample-pier'],
  },
  square: {
    layout: 'center-stage',
    size: '1080x1080',
    caption: 'BOULEVARD QUEEN',
    sub: 'golden hour, every hour',
    badge: 'LEONIDA',
    look: 'neon-nights',
    photos: ['sample-boulevard', 'sample-hero', 'sample-pier', 'sample-hero', 'sample-boulevard'],
  },
  portrait: {
    layout: 'tilted-snapshots',
    size: '1080x1350',
    caption: 'NEON SHORE',
    sub: 'after dark on the strip',
    badge: 'VICE CITY',
    look: 'sunset-drive',
    photos: ['sample-hero', 'sample-pier', 'sample-boulevard'],
  },
  editor: {
    layout: 'hero-left',
    size: '1920x1080',
    caption: 'SUNSET HEIST',
    sub: 'welcome to the coast',
    badge: 'VICE CITY',
    look: 'sunset-drive',
    photos: ['sample-hero', 'sample-boulevard', 'sample-pier'],
  },
};

/** Applies a scene to the editor state and loads its sample photos. */
export async function runShot(shot, query, api) {
  const scene = SCENES[shot] ?? SCENES.cover;
  const caption = query.get('caption') ?? scene.caption;
  if (shot === 'cover' || shot === 'square' || shot === 'portrait') {
    document.body.classList.add('shot-cover');
  }
  const loaded = [];
  for (const id of scene.photos) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) continue;
    const img = await api.loadImage(sample.src);
    loaded.push({ id: sample.id, name: sample.name, img, src: sample.src, kind: 'sample' });
  }
  let state = api.getState();
  state = { ...state, layout: scene.layout, size: scene.size };
  state.panels = panelsForLayout(scene.layout, [], loaded.map((p) => p.id));
  state.caption = { ...state.caption, text: caption, sub: scene.sub };
  state.badge = { ...state.badge, text: scene.badge, show: true };
  state = applyLook(state, scene.look);
  api.setState(state, loaded, { silent: true });
  api.selectPanel(0);
  await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
