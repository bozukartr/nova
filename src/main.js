/* NOVA · açılış, ana döngü ve uyarlanabilir kalite
 *
 * Kare bütçesi FPS ile değil, kare başına *gerçek iş süresi* ile ölçülür:
 * 120 Hz ekranda FPS yüksek görünürken bütçenin iki katının harcandığını
 * ancak bu yakalar. Kademe iki yönlü — geçici bir takılma kaliteyi kalıcı
 * olarak düşürmez.
 */

import { createRenderer } from './renderer.js';
import { createBackground } from './background.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';
import { loadSettings } from './storage.js';
import { updateTweens, tween, Ease } from './anim.js';
import { REDUCED, haptic } from './util.js';

const gameCanvas = document.getElementById('game');
const bgCanvas = document.getElementById('bg');
const stage = document.getElementById('stage');

const settings = loadSettings();
const renderer = createRenderer(gameCanvas);
const bg = createBackground(bgCanvas);
const audio = createAudio(settings.sound);
const hud = createHud();

const Q = { tier: 2, parts: 1, shake: 1, dprCap: 2 };
if (REDUCED) { Q.parts = .4; Q.shake = .25; }
renderer.quality.parts = Q.parts;
renderer.quality.shake = Q.shake;

let game = null;

function layout() {
  if (!game) return;
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dprCap);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.layout(stage.getBoundingClientRect(), game.board, dpr, w, h);
  if (bg) bg.size(Math.round(w * .6), Math.round(h * .6));
}

game = createGame({ renderer, hud, audio, canvas: gameCanvas, onLayout: layout });

/* ── kontroller ─────────────────────────────────────────────── */
const d = hud.dom;

/* Menüdeki her dokunuşta hafif bir titreşim: dokunsal geri bildirim. */
const tapped = fn => e => { audio.unlock(); haptic(8); fn(e); };

d.mResume.addEventListener('click', tapped(() => game.resume()));
d.mPlay2.addEventListener('click', tapped(() => game.playHuman()));
d.mPlayAI.addEventListener('click', tapped(() => hud.showPanel('ai', 1)));
d.mOnline.addEventListener('click', tapped(() => {
  hud.netMsg('online', '');
  hud.showPanel('online', 1);
}));
d.mLearn.addEventListener('click', tapped(() => hud.showPanel('learn', 1)));
d.mSettings.addEventListener('click', tapped(() => hud.showPanel('settings', 1)));

d.lvStack.addEventListener('click', tapped(e => {
  const b = e.target.closest('button');
  if (b) game.playAI(+b.dataset.lv);
}));

for (const b of d.menu.querySelectorAll('[data-back]')) {
  const panel = b.closest('.panel').dataset.panel;
  // Oda ekranlarından geri dönüş online paneline; oda kurulduysa kapatılır.
  b.addEventListener('click', tapped(() => {
    if (panel === 'host') { game.cancelRoom(); return; }
    hud.showPanel(panel === 'join' ? 'online' : 'home', -1);
  }));
}

/* ── çevrimiçi oda ekranları ────────────────────────────────── */
let codeInput = '';

d.mHost.addEventListener('click', tapped(() => game.hostRoom()));
d.mJoin.addEventListener('click', tapped(() => {
  codeInput = '';
  hud.setCodeInput(codeInput);
  hud.netMsg('join', '');
  hud.showPanel('join', 1);
}));
d.btnCancelRoom.addEventListener('click', tapped(() => game.cancelRoom()));
d.btnLeaveRoom.addEventListener('click', tapped(() => game.leaveRoom()));

d.btnShareCode.addEventListener('click', tapped(async () => {
  const code = game.roomCode();
  if (!code) return;
  const text = `NOVA · Kritik Kütle oda kodu: ${code}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(code);
    hud.netMsg('host', 'KOD KOPYALANDI', 'good');
  } catch {
    hud.netMsg('host', 'KOD: ' + code);
  }
}));

d.keypad.addEventListener('click', tapped(e => {
  const b = e.target.closest('button');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'del') codeInput = codeInput.slice(0, -1);
  else if (k === 'clear') codeInput = '';
  else if (codeInput.length < 4) codeInput += k;
  hud.setCodeInput(codeInput);
  hud.netMsg('join', '');
}));
d.btnJoinGo.addEventListener('click', tapped(() => game.joinRoom(codeInput)));

d.boardSeg.addEventListener('click', tapped(e => {
  const b = e.target.closest('button');
  if (b) game.applySettings({ board: b.dataset.val });
}));
d.seriesSeg.addEventListener('click', tapped(e => {
  const b = e.target.closest('button');
  if (b) game.applySettings({ series: +b.dataset.val });
}));
d.swSound.addEventListener('click', tapped(() =>
  game.setSound(d.swSound.getAttribute('aria-checked') !== 'true')));
d.swHaptic.addEventListener('click', tapped(() =>
  game.setHaptics(d.swHaptic.getAttribute('aria-checked') !== 'true')));
d.btnResetStats.addEventListener('click', tapped(() => game.resetStats()));

d.btnMenu.addEventListener('click', tapped(() => game.openMenu('home')));
d.btnNew.addEventListener('click', tapped(() => { hud.closeWin(); game.restartRound(); }));
d.btnUndo.addEventListener('click', () => game.undo());
d.btnSound.addEventListener('click', tapped(() => game.setSound(!game.settings.sound)));
d.btnNext.addEventListener('click', tapped(e => {
  hud.closeWin();
  game.nextRound(!!e.currentTarget.dataset.reset);
}));
d.btnToMenu.addEventListener('click', tapped(() => game.openMenu('home')));

/* ── ölçüm ──────────────────────────────────────────────────── */
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));
if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

let showFps = /[?&]fps=1/.test(location.search);
hud.showFps(showFps);
addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') { showFps = !showFps; hud.showFps(showFps); }
});

/* ── ana döngü ──────────────────────────────────────────────── */
let last = performance.now();
let winStart = last, winWork = 0, winInterval = 0, winFrames = 0;
let slowRuns = 0, fastRuns = 0, warmup = 0;
let paused = false;

function applyTier() {
  if (Q.tier === 2) { Q.parts = 1;   Q.shake = 1;  Q.dprCap = 2; }
  if (Q.tier === 1) { Q.parts = .55; Q.shake = .7; Q.dprCap = 1.7; }
  if (Q.tier === 0) { Q.parts = .28; Q.shake = .4; Q.dprCap = 1.35; }
  if (REDUCED) { Q.parts = Math.min(Q.parts, .4); Q.shake = Math.min(Q.shake, .25); }
  renderer.quality.parts = Q.parts;
  renderer.quality.shake = Q.shake;
  layout();
}

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  game.setNetActive(!paused);      // arka planda oda yoklaması da dursun
  if (!paused) { last = performance.now(); winStart = last; winWork = winInterval = winFrames = 0; }
});

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }

  const interval = now - last;
  let dt = interval / 1000;
  last = now;
  if (dt > .05) dt = .05;            // sekmeden dönüşte sıçramayı kes
  const T = now / 1000;

  const t0 = performance.now();
  updateTweens(dt);
  renderer.step(dt);
  if (bg) { bg.drift(game.tintRgb(), dt); bg.draw(T); }
  renderer.render(game.board, game.view(), T);
  const work = performance.now() - t0;

  winWork += work;
  winInterval += Math.min(interval, 50);
  winFrames++;

  if (now - winStart >= 500) {
    const avgWork = winWork / winFrames;
    const avgInterval = Math.max(6, winInterval / winFrames);
    if (showFps) {
      hud.setFps(`${Math.round(1000 / avgInterval)} FPS · ${avgWork.toFixed(1)}ms · Q${Q.tier}`);
    }
    if (warmup < 2) warmup++;        // ilk saniye: font + shader derlemesi sayılmaz
    else {
      const strained = avgWork > avgInterval * .62 || avgInterval > 21;
      const roomy = avgWork < avgInterval * .30 && avgInterval < 18;
      if (strained) {
        fastRuns = 0;
        if (++slowRuns >= 2 && Q.tier > 0) { Q.tier--; applyTier(); slowRuns = 0; }
      } else if (roomy) {
        slowRuns = 0;
        if (++fastRuns >= 6 && Q.tier < 2) { Q.tier++; applyTier(); fastRuns = 0; }
      } else { slowRuns = 0; fastRuns = 0; }
    }
    winStart = now; winWork = 0; winInterval = 0; winFrames = 0;
  }
}

/* ── açılış ─────────────────────────────────────────────────── */
game.boot();
layout();
setTimeout(layout, 60);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});
requestAnimationFrame(frame);

if (!REDUCED) {
  document.querySelectorAll('.pod').forEach((node, i) => {
    tween({
      from: 0, to: 1, dur: .6, delay: .1 + i * .08, ease: Ease.outQuint,
      onUpdate: v => {
        node.style.opacity = String(v);
        node.style.transform = `translateY(${(1 - v) * -16}px)`;
      },
      onDone: () => { node.style.transform = ''; node.style.opacity = ''; }
    });
  });
  const dock = document.querySelector('.dock');
  tween({
    from: 0, to: 1, dur: .6, delay: .2, ease: Ease.outQuint,
    onUpdate: v => {
      dock.style.opacity = String(v);
      dock.style.transform = `translateY(${(1 - v) * 20}px)`;
    },
    onDone: () => { dock.style.transform = ''; dock.style.opacity = ''; }
  });
}
