// Vice Cover Studio: wires the editor — photos in, cover out.
// Photos are read on this machine and never uploaded anywhere.
import { drawCover, computePanelRects, panelAtPoint, renderCoverToCanvas } from './cover.js';
import { LAYOUTS, LAYOUT_IDS } from './layouts.js';
import { GRADES, GRADE_IDS } from './grades.js';
import {
  EXPORT_SIZES,
  CAPTION_GRADIENTS,
  LOOKS,
  LOOK_IDS,
  defaultState,
  panelsForLayout,
  applyLook,
  snapshot,
  CoverHistory,
} from './state.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const statusEl = $('status');
const toastEl = $('toast');

const SAMPLE_PHOTOS = [
  { id: 'sample-hero', name: 'Hero — convertible', src: 'samples/hero.jpg' },
  { id: 'sample-boulevard', name: 'Boulevard — sunset', src: 'samples/boulevard.jpg' },
  { id: 'sample-pier', name: 'Pier — fishing', src: 'samples/pier.jpg' },
];

/** id -> { id, name, img, src, kind } ; kind is 'sample' or 'upload'. */
const photoRegistry = new Map();
let photoSeq = 0;
let state = defaultState();
let history = new CoverHistory(state);
let selectedPanel = 0;
let lastRects = [];
let renderQueued = false;

function photoImages() {
  const map = new Map();
  for (const [id, photo] of photoRegistry) map.set(id, photo.img);
  return map;
}

function setStatus(text) {
  statusEl.textContent = text;
}

let toastTimer = 0;
function toast(text, isError = false) {
  toastEl.textContent = text;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** Loads a user file with EXIF orientation honoured where the browser can. */
async function loadUserFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image file.`);
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return bitmap;
    } catch {
      // Fall through to the plain <img> path below.
    }
  }
  return loadImage(URL.createObjectURL(file));
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  const size = EXPORT_SIZES[state.size];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  // In shot-cover mode the canvas is the cover itself: no editor chrome
  // (selection outline) may leak into the exported artwork.
  const highlight = document.body.classList.contains('shot-cover') ? null : selectedPanel;
  lastRects = drawCover(canvas, state, photoImages(), { highlight });
  $('empty-state').classList.toggle('hidden', photoRegistry.size > 0);
  updatePanelControls();
}

/** Records a state change for undo, then re-renders. */
function commit(next, message) {
  state = next;
  history.commit(state);
  refreshUndoButtons();
  queueRender();
  if (message) setStatus(message);
}

// Text fields commit to history on a short debounce (and at once on blur),
// so Ctrl+Z always has the typed text to undo — typing alone must never
// leave an edit the history cannot see.
let textCommitTimer = 0;
let textCommitPending = false;
function scheduleTextCommit() {
  textCommitPending = true;
  clearTimeout(textCommitTimer);
  textCommitTimer = setTimeout(() => {
    textCommitPending = false;
    history.commit(state);
    refreshUndoButtons();
  }, 600);
}
function commitTextNow() {
  if (!textCommitPending) return;
  textCommitPending = false;
  clearTimeout(textCommitTimer);
  history.commit(state);
  refreshUndoButtons();
}

function refreshUndoButtons() {
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

/** Adds a photo to the registry and fills empty panels with it. */
function registerPhoto(photo) {
  photoRegistry.set(photo.id, photo);
  const empty = state.panels.findIndex((p) => !p.photoId);
  const next = snapshot(state);
  if (empty >= 0) {
    next.panels[empty].photoId = photo.id;
  } else if (next.panels.length) {
    next.panels[selectedPanel].photoId = photo.id;
  }
  state = next;
  history.commit(state);
  refreshUndoButtons();
  renderPhotoTray();
  queueRender();
  return photo;
}

async function addSamplePhoto(sample) {
  if (photoRegistry.has(sample.id)) {
    toast(`"${sample.name}" is already in the tray.`);
    return;
  }
  try {
    const img = await loadImage(sample.src);
    registerPhoto({ ...sample, img, kind: 'sample' });
    setStatus(`Added sample photo: ${sample.name}.`);
  } catch (err) {
    toast(`Could not load the sample photo: ${err.message}`, true);
  }
}

async function addUserPhotos(files) {
  const list = [...files];
  if (photoRegistry.size + list.length > 8) {
    toast('Keep it to 8 photos at most — remove one first.', true);
    return;
  }
  for (const file of list) {
    try {
      const img = await loadUserFile(file);
      photoSeq += 1;
      registerPhoto({
        id: `upload-${photoSeq}`,
        name: file.name,
        img,
        src: '',
        kind: 'upload',
      });
      setStatus(`Added photo: ${file.name}.`);
    } catch (err) {
      toast(err.message, true);
    }
  }
}

/** The photo tray: thumbnails, remove buttons, click to assign to the panel. */
function renderPhotoTray() {
  const tray = $('photo-tray');
  tray.innerHTML = '';
  if (!photoRegistry.size) {
    tray.innerHTML = '<p class="tray-empty">No photos yet — drop some in, or try a sample below.</p>';
    return;
  }
  for (const photo of photoRegistry.values()) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.title = photo.name;
    const thumb = document.createElement('canvas');
    thumb.width = 96;
    thumb.height = 72;
    const tctx = thumb.getContext('2d');
    const iw = photo.img.naturalWidth || photo.img.width;
    const ih = photo.img.naturalHeight || photo.img.height;
    const scale = Math.max(96 / iw, 72 / ih);
    tctx.drawImage(photo.img, (96 - iw * scale) / 2, (72 - ih * scale) / 2, iw * scale, ih * scale);
    card.appendChild(thumb);
    const label = document.createElement('span');
    label.textContent = photo.name.length > 18 ? `${photo.name.slice(0, 17)}…` : photo.name;
    card.appendChild(label);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${photo.name}`);
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removePhoto(photo.id);
    });
    card.appendChild(remove);
    card.addEventListener('click', () => {
      const next = snapshot(state);
      next.panels[selectedPanel].photoId = photo.id;
      commit(next, `Panel ${selectedPanel + 1} now shows ${photo.name}.`);
    });
    tray.appendChild(card);
  }
}

function removePhoto(id) {
  const photo = photoRegistry.get(id);
  photoRegistry.delete(id);
  const next = snapshot(state);
  next.panels.forEach((p) => {
    if (p.photoId === id) p.photoId = null;
  });
  state = next;
  history.commit(state);
  refreshUndoButtons();
  renderPhotoTray();
  queueRender();
  setStatus(photo ? `Removed ${photo.name}.` : 'Photo removed.');
}

/** Layout picker: a mini poster diagram per layout, built from its definition. */
function buildLayoutPicker() {
  const picker = $('layout-picker');
  LAYOUT_IDS.forEach((id) => {
    const layout = LAYOUTS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layout-option';
    button.dataset.layout = id;
    button.setAttribute('aria-label', `${layout.name}: ${layout.blurb}`);
    const diagram = document.createElement('span');
    diagram.className = 'layout-diagram';
    layout.panels.forEach((panel) => {
      const cell = document.createElement('span');
      cell.className = 'layout-cell';
      const b = panel.points
        ? { x: Math.min(...panel.points.map((p) => p[0])), y: Math.min(...panel.points.map((p) => p[1])), w: Math.max(...panel.points.map((p) => p[0])) - Math.min(...panel.points.map((p) => p[0])), h: Math.max(...panel.points.map((p) => p[1])) - Math.min(...panel.points.map((p) => p[1])) }
        : panel;
      cell.style.left = `${b.x * 100}%`;
      cell.style.top = `${b.y * 100}%`;
      cell.style.width = `${b.w * 100}%`;
      cell.style.height = `${b.h * 100}%`;
      if (panel.rotate) cell.style.transform = `rotate(${panel.rotate}deg)`;
      diagram.appendChild(cell);
    });
    button.appendChild(diagram);
    const name = document.createElement('span');
    name.className = 'layout-name';
    name.textContent = layout.name;
    button.appendChild(name);
    button.addEventListener('click', () => {
      const next = snapshot(state);
      next.layout = id;
      next.panels = panelsForLayout(id, next.panels, [...photoRegistry.keys()]);
      commit(next, `Layout: ${layout.name}.`);
      markActiveLayout();
    });
    picker.appendChild(button);
  });
  markActiveLayout();
}

function markActiveLayout() {
  document.querySelectorAll('.layout-option').forEach((el) => {
    el.classList.toggle('active', el.dataset.layout === state.layout);
  });
}

/** One-click looks: grade, lettering and effects in a single preset. */
function buildLookPicker() {
  const picker = $('look-picker');
  LOOK_IDS.forEach((id) => {
    const look = LOOKS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'look-option';
    button.dataset.look = id;
    button.textContent = look.name;
    button.title = look.blurb;
    button.addEventListener('click', () => {
      commit(applyLook(snapshot(state), id), `Look: ${look.name}.`);
      markActiveLook();
    });
    picker.appendChild(button);
  });
  markActiveLook();
}

function markActiveLook() {
  document.querySelectorAll('.look-option').forEach((el) => {
    el.classList.toggle('active', el.dataset.look === state.look);
  });
}

/** Sample photo buttons under the tray. */
function buildSampleButtons() {
  const wrap = $('sample-buttons');
  SAMPLE_PHOTOS.forEach((sample) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sample-button';
    button.textContent = sample.name;
    button.addEventListener('click', () => addSamplePhoto(sample));
    wrap.appendChild(button);
  });
}

/** Selected-panel controls, refreshed from state on every render. */
function updatePanelControls() {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  $('panel-title').textContent = `Panel ${selectedPanel + 1} of ${state.panels.length}`;
  const select = $('panel-photo');
  const current = [...photoRegistry.values()];
  select.innerHTML = '<option value="">— empty —</option>';
  current.forEach((photo) => {
    const option = document.createElement('option');
    option.value = photo.id;
    option.textContent = photo.name;
    if (photo.id === panel.photoId) option.selected = true;
    select.appendChild(option);
  });
  $('panel-zoom').value = String(panel.zoom);
  $('panel-zoom-value').textContent = `${Math.round(panel.zoom * 100)}%`;
  $('panel-fit').value = panel.fit;
  const gradeSelect = $('panel-grade');
  if (!gradeSelect.options.length) {
    GRADE_IDS.forEach((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = GRADES[id].name;
      gradeSelect.appendChild(option);
    });
  }
  gradeSelect.value = panel.grade;
  $('panel-intensity').value = String(panel.intensity);
  $('panel-intensity-value').textContent = `${Math.round(panel.intensity * 100)}%`;
}

/** Binds every control to the state it edits. */
function bindControls() {
  // Upload + drag and drop.
  $('photo-input').addEventListener('change', (e) => {
    addUserPhotos(e.target.files);
    e.target.value = '';
  });
  const dropzone = $('dropzone');
  ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  }));
  dropzone.addEventListener('drop', (e) => addUserPhotos(e.dataTransfer.files));
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    addUserPhotos(e.dataTransfer.files);
  });

  // Export size.
  document.querySelectorAll('[data-size]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = snapshot(state);
      next.size = button.dataset.size;
      commit(next, `Preview size: ${EXPORT_SIZES[next.size].label}.`);
      markActiveSize();
    });
  });

  // Selected panel.
  $('panel-photo').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.panels[selectedPanel].photoId = e.target.value || null;
    commit(next);
  });
  $('panel-zoom').addEventListener('input', (e) => {
    const next = snapshot(state);
    next.panels[selectedPanel].zoom = Number(e.target.value);
    state = next;
    queueRender();
    $('panel-zoom-value').textContent = `${Math.round(next.panels[selectedPanel].zoom * 100)}%`;
  });
  $('panel-zoom').addEventListener('change', () => history.commit(state));
  $('panel-fit').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.panels[selectedPanel].fit = e.target.value;
    commit(next, `Panel ${selectedPanel + 1}: ${e.target.value === 'fill' ? 'fill the panel' : 'fit inside the panel'}.`);
  });
  $('panel-grade').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.panels[selectedPanel].grade = e.target.value;
    commit(next, `Panel ${selectedPanel + 1} grade: ${GRADES[e.target.value].name}.`);
  });
  $('panel-intensity').addEventListener('input', (e) => {
    const next = snapshot(state);
    next.panels[selectedPanel].intensity = Number(e.target.value);
    state = next;
    queueRender();
    $('panel-intensity-value').textContent = `${Math.round(next.panels[selectedPanel].intensity * 100)}%`;
  });
  $('panel-intensity').addEventListener('change', () => history.commit(state));

  // Caption.
  $('caption-text').addEventListener('input', (e) => {
    state = { ...state, caption: { ...state.caption, text: e.target.value } };
    queueRender();
    scheduleTextCommit();
  });
  $('caption-text').addEventListener('change', () => commitTextNow());
  $('caption-sub').addEventListener('input', (e) => {
    state = { ...state, caption: { ...state.caption, sub: e.target.value } };
    queueRender();
    scheduleTextCommit();
  });
  $('caption-sub').addEventListener('change', () => commitTextNow());
  $('caption-size').addEventListener('input', (e) => {
    state = { ...state, caption: { ...state.caption, size: Number(e.target.value) } };
    queueRender();
    $('caption-size-value').textContent = `${Math.round(state.caption.size * 100)}%`;
  });
  $('caption-size').addEventListener('change', () => history.commit(state));
  $('caption-spacing').addEventListener('input', (e) => {
    state = { ...state, caption: { ...state.caption, spacing: Number(e.target.value) } };
    queueRender();
  });
  $('caption-spacing').addEventListener('change', () => history.commit(state));
  const gradientSelect = $('caption-gradient');
  Object.entries(CAPTION_GRADIENTS).forEach(([id, g]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = g.name;
    gradientSelect.appendChild(option);
  });
  gradientSelect.addEventListener('change', (e) => {
    const next = snapshot(state);
    next.caption.gradient = e.target.value;
    commit(next, `Caption gradient: ${CAPTION_GRADIENTS[e.target.value].name}.`);
  });
  $('caption-outline').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.caption.outline = e.target.checked;
    commit(next);
  });
  $('caption-shadow').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.caption.shadow = e.target.checked;
    commit(next);
  });
  document.querySelectorAll('[data-position]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = snapshot(state);
      next.caption.position = button.dataset.position;
      commit(next, `Caption at the ${button.dataset.position}.`);
      markActivePosition();
    });
  });

  // Badge.
  $('badge-text').addEventListener('input', (e) => {
    state = { ...state, badge: { ...state.badge, text: e.target.value } };
    queueRender();
    scheduleTextCommit();
  });
  $('badge-text').addEventListener('change', () => commitTextNow());
  $('badge-show').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.badge.show = e.target.checked;
    commit(next);
  });

  // Effects.
  $('effect-grain').addEventListener('input', (e) => {
    state = { ...state, effects: { ...state.effects, grain: Number(e.target.value) } };
    queueRender();
    $('effect-grain-value').textContent = `${Math.round(state.effects.grain * 100)}%`;
  });
  $('effect-grain').addEventListener('change', () => history.commit(state));
  $('effect-halftone').addEventListener('change', (e) => {
    const next = snapshot(state);
    next.effects.halftone = e.target.checked;
    commit(next, e.target.checked ? 'Halftone title block on.' : 'Halftone title block off.');
  });
  $('effect-vignette').addEventListener('input', (e) => {
    state = { ...state, effects: { ...state.effects, vignette: Number(e.target.value) } };
    queueRender();
    $('effect-vignette-value').textContent = `${Math.round(state.effects.vignette * 100)}%`;
  });
  $('effect-vignette').addEventListener('change', () => history.commit(state));

  // Export buttons.
  document.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => exportPng(button.dataset.export));
  });
  $('export-main').addEventListener('click', () => exportPng(state.size));

  // Undo / redo / reset.
  $('undo').addEventListener('click', doUndo);
  $('redo').addEventListener('click', doRedo);
  $('reset').addEventListener('click', () => {
    const next = defaultState();
    next.panels = panelsForLayout(next.layout, [], [...photoRegistry.keys()]);
    state = next;
    history = new CoverHistory(state);
    selectedPanel = 0;
    syncCaptionControls();
    markActiveLayout();
    markActiveLook();
    markActiveSize();
    markActivePosition();
    refreshUndoButtons();
    queueRender();
    setStatus('Reset to the fresh Sunset Drive cover.');
  });

  // Keyboard: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+E export, 1/2/3 sizes.
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      doRedo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      exportPng(state.size);
    } else if (!inField && ['1', '2', '3'].includes(e.key)) {
      const sizes = Object.keys(EXPORT_SIZES);
      const next = snapshot(state);
      next.size = sizes[Number(e.key) - 1];
      commit(next, `Preview size: ${EXPORT_SIZES[next.size].label}.`);
      markActiveSize();
    } else if (!inField && e.key.startsWith('Arrow')) {
      nudgeSelectedPanel(e.key);
    }
  });

  bindCanvasPointer();
}

function markActiveSize() {
  document.querySelectorAll('[data-size]').forEach((el) => {
    el.classList.toggle('active', el.dataset.size === state.size);
  });
}

function markActivePosition() {
  document.querySelectorAll('[data-position]').forEach((el) => {
    el.classList.toggle('active', el.dataset.position === state.caption.position);
  });
}

function syncCaptionControls() {
  $('caption-text').value = state.caption.text;
  $('caption-sub').value = state.caption.sub;
  $('caption-size').value = String(state.caption.size);
  $('caption-size-value').textContent = `${Math.round(state.caption.size * 100)}%`;
  $('caption-spacing').value = String(state.caption.spacing);
  $('caption-gradient').value = state.caption.gradient;
  $('caption-outline').checked = state.caption.outline;
  $('caption-shadow').checked = state.caption.shadow;
  $('badge-text').value = state.badge.text;
  $('badge-show').checked = state.badge.show;
  $('effect-grain').value = String(state.effects.grain);
  $('effect-grain-value').textContent = `${Math.round(state.effects.grain * 100)}%`;
  $('effect-halftone').checked = state.effects.halftone;
  $('effect-vignette').value = String(state.effects.vignette);
  $('effect-vignette-value').textContent = `${Math.round(state.effects.vignette * 100)}%`;
}

function doUndo() {
  // A half-typed caption is flushed into history first, so this undo
  // steps back over the typing itself instead of skipping past it.
  commitTextNow();
  const prev = history.undo();
  if (!prev) return;
  state = prev;
  selectedPanel = Math.min(selectedPanel, state.panels.length - 1);
  syncCaptionControls();
  markActiveLayout();
  markActiveLook();
  markActiveSize();
  markActivePosition();
  refreshUndoButtons();
  queueRender();
  setStatus('Undid that change.');
}

function doRedo() {
  const nextState = history.redo();
  if (!nextState) return;
  state = nextState;
  selectedPanel = Math.min(selectedPanel, state.panels.length - 1);
  syncCaptionControls();
  markActiveLayout();
  markActiveLook();
  markActiveSize();
  markActivePosition();
  refreshUndoButtons();
  queueRender();
  setStatus('Redid that change.');
}

/** Arrow keys nudge the selected panel's photo by a small step. */
function nudgeSelectedPanel(key) {
  const panel = state.panels[selectedPanel];
  if (!panel || !panel.photoId) return;
  const next = snapshot(state);
  const step = 0.02;
  if (key === 'ArrowLeft') next.panels[selectedPanel].panX = Math.max(0, panel.panX - step);
  if (key === 'ArrowRight') next.panels[selectedPanel].panX = Math.min(1, panel.panX + step);
  if (key === 'ArrowUp') next.panels[selectedPanel].panY = Math.max(0, panel.panY - step);
  if (key === 'ArrowDown') next.panels[selectedPanel].panY = Math.min(1, panel.panY + step);
  state = next;
  queueRender();
}

/** Click selects a panel; drag pans its photo; the wheel zooms it. */
function bindCanvasPointer() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const point = canvasPoint(e);
    const hit = panelAtPoint(lastRects, point.x, point.y);
    if (hit < 0) return;
    selectedPanel = hit;
    const panel = state.panels[hit];
    drag = { panel: hit, startX: e.clientX, startY: e.clientY, panX: panel.panX, panY: panel.panY };
    canvas.setPointerCapture(e.pointerId);
    queueRender();
    setStatus(`Panel ${hit + 1} selected — drag to move its photo, scroll to zoom.`);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = lastRects[drag.panel];
    const panel = state.panels[drag.panel];
    if (!rect || !panel || !panel.photoId) return;
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const dx = (e.clientX - drag.startX) * scaleX;
    const dy = (e.clientY - drag.startY) * scaleX;
    const img = photoRegistry.get(panel.photoId)?.img;
    if (!img) return;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const base = panel.fit === 'fill' ? Math.max(rect.w / iw, rect.h / ih) : Math.min(rect.w / iw, rect.h / ih);
    const dw = iw * base * panel.zoom;
    const dh = ih * base * panel.zoom;
    const slackX = Math.max(1, (dw - rect.w) / 2);
    const slackY = Math.max(1, (dh - rect.h) / 2);
    const next = snapshot(state);
    next.panels[drag.panel].panX = Math.min(1, Math.max(0, drag.panX - dx / (slackX * 2)));
    next.panels[drag.panel].panY = Math.min(1, Math.max(0, drag.panY - dy / (slackY * 2)));
    state = next;
    queueRender();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag) history.commit(state);
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const panel = state.panels[selectedPanel];
    if (!panel || !panel.photoId) return;
    const next = snapshot(state);
    const zoom = panel.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08);
    next.panels[selectedPanel].zoom = Math.min(4, Math.max(0.5, zoom));
    state = next;
    queueRender();
    $('panel-zoom-value').textContent = `${Math.round(next.panels[selectedPanel].zoom * 100)}%`;
    $('panel-zoom').value = String(next.panels[selectedPanel].zoom);
  }, { passive: false });
}

function canvasPoint(e) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - box.left) / box.width) * canvas.width,
    y: ((e.clientY - box.top) / box.height) * canvas.height,
  };
}

/** Exports the cover at a size as a PNG download. */
export async function exportPng(sizeKey) {
  const size = EXPORT_SIZES[sizeKey];
  if (!size) return null;
  setStatus(`Exporting ${size.label}…`);
  const out = renderCoverToCanvas(state, photoImages(), size.w, size.h);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) {
    toast('Export failed — the browser could not make the PNG.', true);
    return null;
  }
  const name = `vice-cover-${sizeKey}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus(`Saved ${name} (${size.w} x ${size.h}).`);
  return { name, width: size.w, height: size.h, bytes: blob.size };
}

function selectPanel(index) {
  selectedPanel = Math.max(0, Math.min(index, state.panels.length - 1));
  queueRender();
}

// A small API for screenshots and for the verification pass.
window.__viceCover = {
  getState: () => snapshot(state),
  setState(next, photos = [], opts = {}) {
    if (photos.length) {
      for (const photo of photos) photoRegistry.set(photo.id, photo);
      renderPhotoTray();
    }
    state = snapshot(next);
    if (!opts.silent) history.commit(state);
    selectedPanel = Math.min(selectedPanel, state.panels.length - 1);
    syncCaptionControls();
    markActiveLayout();
    markActiveLook();
    markActiveSize();
    markActivePosition();
    refreshUndoButtons();
    queueRender();
  },
  loadImage,
  selectPanel,
  exportPng,
  photoCount: () => photoRegistry.size,
  renderNow,
};

buildLayoutPicker();
buildLookPicker();
buildSampleButtons();
bindControls();
syncCaptionControls();
markActiveSize();
markActivePosition();
refreshUndoButtons();
state.panels = panelsForLayout(state.layout, [], []);
// History starts here, once the panels exist: an undo must never land on
// the pre-panel state (whose panels list is empty).
history = new CoverHistory(state);
renderPhotoTray();
renderNow();

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), window.__viceCover);
}
