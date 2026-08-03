/* NOVA · ön-render sprite atlası
 *
 * shadowBlur / filter kullanılmaz: her parıltı bir kez off-screen canvas'a
 * çizilir, sonra sadece drawImage ile basılır. Mobil GPU'da fark ~10 kat.
 */

import { SIDES } from './config.js';
import { rgba } from './util.js';

function padCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function makeOrb(rgb, mode) {
  const S = 128, c = padCanvas(S), g = c.getContext('2d'), h = S / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, rgba(rgb, .85));
  gr.addColorStop(.22, rgba(rgb, .42));
  gr.addColorStop(.55, rgba(rgb, .10));
  gr.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';

  if (mode === 'star') {                    // MAGMA: dört kollu korona
    g.translate(h, h);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      const lg = g.createLinearGradient(0, 0, 0, -h);
      lg.addColorStop(0, rgba(rgb, .55));
      lg.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -h); g.lineTo(5, 0); g.closePath(); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else {                                  // AURORA: hale halkası
    g.strokeStyle = rgba(rgb, .5); g.lineWidth = 2.4;
    g.beginPath(); g.arc(h, h, S * .3, 0, Math.PI * 2); g.stroke();
  }

  const core = g.createRadialGradient(h - 6, h - 7, 1, h, h, S * .19);
  core.addColorStop(0, '#fff');
  core.addColorStop(.42, rgba(rgb, 1));
  core.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = core;
  g.beginPath(); g.arc(h, h, S * .19, 0, Math.PI * 2); g.fill();
  return c;
}

function makeSpark(rgb) {
  const S = 64, c = padCanvas(S), g = c.getContext('2d'), h = S / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, '#fff');
  gr.addColorStop(.25, rgba(rgb, .9));
  gr.addColorStop(.6, rgba(rgb, .22));
  gr.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

function makeTint(rgb) {
  const S = 96, c = padCanvas(S), g = c.getContext('2d'), h = S / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, rgba(rgb, .30));
  gr.addColorStop(.6, rgba(rgb, .08));
  gr.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

function makeRing(rgb) {
  const S = 128, c = padCanvas(S), g = c.getContext('2d'), h = S / 2;
  g.strokeStyle = rgba(rgb, .85); g.lineWidth = 3; g.setLineDash([9, 9]);
  g.beginPath(); g.arc(h, h, S * .40, 0, Math.PI * 2); g.stroke();
  return c;
}

function makeCursor() {
  const S = 128, c = padCanvas(S), g = c.getContext('2d'), m = 10, r = 26;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.lineCap = 'round';
  const corners = [[m, m, 1, 1], [S - m, m, -1, 1], [m, S - m, 1, -1], [S - m, S - m, -1, -1]];
  for (const [x, y, dx, dy] of corners) {
    g.beginPath();
    g.moveTo(x + dx * r, y);
    g.lineTo(x, y);
    g.lineTo(x, y + dy * r);
    g.stroke();
  }
  return c;
}

function makeDigit(n) {
  const S = 64, c = padCanvas(S), g = c.getContext('2d');
  g.font = '700 34px Syne, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.13)';
  g.fillText(String(n), S / 2, S / 2 + 1);
  return c;
}

export function buildSprites() {
  const bySide = {};
  for (const k of [1, 2]) {
    bySide[k] = {
      orb: makeOrb(SIDES[k].rgb, k === 1 ? 'star' : 'ring'),
      spark: makeSpark(SIDES[k].rgb),
      tint: makeTint(SIDES[k].rgb),
      ring: makeRing(SIDES[k].rgb)
    };
  }
  return {
    side: bySide,
    digit: { 2: makeDigit(2), 3: makeDigit(3), 4: makeDigit(4) },
    cursor: makeCursor()
  };
}
