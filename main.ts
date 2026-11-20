// Vice Cover Studio — the entry program (Node 22, standard library only).
//
// It hands the app in: copies this directory's app/ (the offline cover maker:
// index.html, its ES modules, fonts and sample photos) and screenshots/ to
// /output, then writes /output/dossier.json with the vendored make.fun
// library, the summary the judge reads. It also checks the hand-in first
// (index.html must exist, screenshots must be 3 or 4 files) and prints a
// one-line summary of what it wrote, so a bad build fails loudly here
// instead of silently at the gate.
//
// Serve the app locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Walks a directory and counts its files and bytes (no symlinks followed). */
function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const indexHtml = join(here, 'app', 'index.html');
if (!existsSync(indexHtml)) {
  throw new Error('refusing to hand in an entry without app/index.html');
}
const shotDir = join(here, 'screenshots');
const shotCount = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => !name.startsWith('.')).length
  : 0;
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotCount}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of
// app files, in all, or a path under app/ over 1000 bytes: app/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

const appTree = countTree(join(out, 'app'));
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `vice-cover-studio: handed in app/ (${appTree.files} files, ${appTree.bytes} bytes), `
  + `${shotCount} screenshots, dossier.json (${dossierBytes} bytes) -> ${out}`,
);
