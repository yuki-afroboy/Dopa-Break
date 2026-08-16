// ============================================================
// 起動 / キャンバス / 入力 / メインループ
// ============================================================

import { Game, STATE } from './game.js';
import { UI } from './ui.js';
import { SFX } from './audio.js';
import { Meta } from './meta.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

Meta.load();
SFX.setMuted(Meta.data.muted);

const ui = new UI();
const game = new Game(canvas, ctx, ui);

// ---------------- リサイズ ----------------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  game.dpr = dpr;
  game.resize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

// ---------------- 入力 ----------------
function pos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function onDown(ev) {
  SFX.resume();
  const p = pos(ev);
  game.pointer.x = p.x; game.pointer.y = p.y;
  game.pointer.active = true;

  if (game.state === STATE.TITLE) {
    game.startRun();
    game.pointer.down = true;
    game.primeShot();
    return;
  }
  if (game.state === STATE.PLAY) {
    game.pointer.down = true;
    game.primeShot();
  }
}

function onMove(ev) {
  const p = pos(ev);
  game.pointer.x = p.x; game.pointer.y = p.y;
  game.pointer.active = true;
}

function onUp() { game.pointer.down = false; }

canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
canvas.addEventListener('pointermove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
window.addEventListener('blur', onUp);
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

// マウスでも照準を出す
window.addEventListener('mousemove', (e) => { onMove(e); });

// ---------------- ボタン ----------------
document.getElementById('retry').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  SFX.resume();
  game.startRun();
});

document.getElementById('toTitle').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  game.goTitle();
});

const muteBtn = document.getElementById('mute');
function syncMute() { muteBtn.textContent = Meta.data.muted ? '🔇' : '🔊'; }
muteBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  Meta.data.muted = !Meta.data.muted;
  Meta.save();
  SFX.setMuted(Meta.data.muted);
  if (!Meta.data.muted) { SFX.resume(); SFX.coin(); }
  syncMute();
});
syncMute();

// ---------------- ループ ----------------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;      // タブ復帰などでの巨大 dt を防ぐ
  game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}

game.goTitle();
requestAnimationFrame(frame);

// デバッグ用
window.__game = game;
