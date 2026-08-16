// ============================================================
// 単一HTMLファイルへのバンドル
//
// src/ の ES Modules は開発しやすさのために分割したままにしておき、
// 配布用にだけ 1ファイルへ畳む。これで file:// の直開きでも遊べる。
//
//   node build.mjs            -> dist/dopa-break.html（完全なHTML）
//   node build.mjs --body OUT -> <body>の中身だけを OUT に出力
//
// 依存パッケージなし。
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// 依存関係の順（下ほど後ろ = 先に定義されたものを使う）
const MODULES = [
  'src/rng.js',
  'src/config.js',
  'src/audio.js',
  'src/fx.js',
  'src/entities.js',
  'src/upgrades.js',
  'src/events.js',
  'src/meta.js',
  'src/ui.js',
  'src/game.js',
  'src/main.js',
];

const IMPORT_RE = /^import\s+.*?from\s+['"].*?['"];\s*$/gm;
const EXPORT_RE = /^export\s+(const|let|function|class|async\s+function)\s/gm;

/** 連結後は1スコープになるので、トップレベル名の衝突を検出して落とす */
function topLevelNames(code) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) names.add(m[1]);
  return names;
}

function bundle() {
  const seen = new Map(); // name -> module
  const parts = [];

  for (const file of MODULES) {
    const raw = read(file);

    for (const name of topLevelNames(raw)) {
      if (seen.has(name)) {
        throw new Error(
          `名前衝突: "${name}" が ${seen.get(name)} と ${file} の両方でトップレベル定義されています。` +
          `\n1スコープに畳むためリネームが必要です。`
        );
      }
      seen.set(name, file);
    }

    const code = raw.replace(IMPORT_RE, '').replace(EXPORT_RE, '$1 ');
    parts.push(`/* ===== ${file} ===== */\n${code.trim()}`);
  }

  const out = `(() => {\n'use strict';\n\n${parts.join('\n\n')}\n})();`;

  // import/export が残っていると、通常の <script> では構文エラーで
  // ゲームが起動しない。壊れた成果物を出さないためここで落とす。
  const leftover = out.match(/^\s*(import|export)\s/gm);
  if (leftover) {
    throw new Error(`バンドル後に ${leftover.length} 個の import/export が残っています: ${[...new Set(leftover.map((s) => s.trim()))].join(', ')}`);
  }
  return out;
}

function buildBody() {
  const html = read('index.html');
  const css = read('css/style.css');
  const js = bundle();

  // <body> の中身だけを取り出し、外部参照を埋め込みに差し替える
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
    .replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/g, '')
    .trim();

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'DOPA BREAK'])[1];
  // favicon は data URI なので、そのまま単一ファイル版へ持ち越せる
  const icon = (html.match(/<link\s+rel=["']icon["'][^>]*>/) || [''])[0];

  return { body, css, js, title, icon };
}

const { body, css, js, title, icon } = buildBody();

const bodyOnly = `<title>${title}</title>
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;

const full = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05060d">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${title}</title>
${icon}
<style>
${css}
</style>
</head>
<body>
${body}

<script>
${js}
</script>
</body>
</html>
`;

const bodyArg = process.argv.indexOf('--body');
if (bodyArg !== -1 && process.argv[bodyArg + 1]) {
  const out = process.argv[bodyArg + 1];
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), bodyOnly);
  console.log(`body-only -> ${out}  (${(bodyOnly.length / 1024).toFixed(1)} KB)`);
} else {
  mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
  writeFileSync(resolve(ROOT, 'dist/dopa-break.html'), full);
  console.log(`standalone -> dist/dopa-break.html  (${(full.length / 1024).toFixed(1)} KB)`);
}
