// Layouts for Vice Cover Studio: every layout is a set of panels in unit space
// (0..1 of the cover). A panel is a rectangle, or a polygon when `points` is set
// (points are [x, y] pairs in the same unit space), and may carry a `rotate`
// in degrees for the tilted polaroid look. The cover renderer inks each panel
// with a white gutter between neighbours, poster style.
export const LAYOUTS = {
  'hero-left': {
    name: 'Hero Left',
    blurb: 'One big hero panel, two stacked on the right.',
    panels: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
    ],
  },
  'comic-strip': {
    name: 'Comic Strip',
    blurb: 'Three tall columns, like a comic page.',
    panels: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  diagonal: {
    name: 'Diagonal Split',
    blurb: 'Two panels cut on a diagonal, poster style.',
    panels: [
      { points: [[0, 0], [1, 0], [1, 0.28], [0, 0.72]] },
      { points: [[0, 0.72], [1, 0.28], [1, 1], [0, 1]] },
    ],
  },
  'center-stage': {
    name: 'Center Stage',
    blurb: 'One big centre panel ringed by four small ones.',
    panels: [
      { x: 0.27, y: 0.1, w: 0.46, h: 0.64 },
      { x: 0, y: 0, w: 0.27, h: 0.34 },
      { x: 0.73, y: 0, w: 0.27, h: 0.34 },
      { x: 0, y: 0.66, w: 0.27, h: 0.34 },
      { x: 0.73, y: 0.66, w: 0.27, h: 0.34 },
    ],
  },
  'tilted-snapshots': {
    name: 'Tilted Snapshots',
    blurb: 'Overlapping polaroids, slightly askew, white frames.',
    polaroid: true,
    panels: [
      { x: 0.02, y: 0.06, w: 0.5, h: 0.6, rotate: -5 },
      { x: 0.44, y: 0.02, w: 0.52, h: 0.6, rotate: 3.5 },
      { x: 0.2, y: 0.4, w: 0.54, h: 0.56, rotate: -2 },
    ],
  },
  'nine-grid': {
    name: 'Nine Grid',
    blurb: 'A 3 x 3 grid of moments, title over the foot.',
    panels: [
      { x: 0, y: 0, w: 1 / 3, h: 1 / 3 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 / 3 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 / 3 },
      { x: 0, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
      { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
      { x: 2 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
      { x: 0, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
      { x: 1 / 3, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
      { x: 2 / 3, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
    ],
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

/** Bounding box of a panel in unit space, whether rect or polygon. */
export function panelBounds(panel) {
  if (!panel.points) return { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
  const xs = panel.points.map((p) => p[0]);
  const ys = panel.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}
