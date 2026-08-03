/* NOVA · canvas çizimi, parçacıklar ve kamera
 *
 * Tüm parlama efektleri sprites.js'teki hazır atlastan drawImage ile basılır.
 * Parçacıklar sabit boyutlu tipli dizilerde tutulur: kare başına sıfır tahsis,
 * dolayısıyla çöp toplayıcı zincir ortasında devreye girip takılma yapmaz.
 */

import { SIDES } from './config.js';
import { rgba, clamp } from './util.js';
import { buildSprites } from './sprites.js';

const POOL = 720;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const SPR = buildSprites();

  /* parçacık havuzu */
  const px = new Float32Array(POOL), py = new Float32Array(POOL);
  const pvx = new Float32Array(POOL), pvy = new Float32Array(POOL);
  const plife = new Float32Array(POOL), pmax = new Float32Array(POOL);
  const psize = new Float32Array(POOL), pside = new Uint8Array(POOL);
  let head = 0;

  const comets = [];
  const waves = [];

  let fxPop = new Float32Array(0), fxGlow = new Float32Array(0);
  let cell = 60, bx = 0, by = 0, cols = 5, rows = 6;
  let vw = 0, vh = 0, dpr = 1;
  let shakeAmt = 0, shakeX = 0, shakeY = 0;
  let flashAmt = 0, flashSide = 1;

  const quality = { parts: 1, shake: 1 };

  const cxOf = i => bx + ((i % cols) + .5) * cell;
  const cyOf = i => by + (((i / cols) | 0) + .5) * cell;

  function emit(x, y, vx, vy, life, size, side) {
    const i = head; head = (head + 1) % POOL;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
    plife[i] = life; pmax[i] = life; psize[i] = size; pside[i] = side;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  return {
    quality,
    get cell() { return cell; },

    /** Tahta ölçüsü değiştiğinde efekt tamponları da yeniden boyutlanır. */
    resizeFor(board) {
      if (fxPop.length !== board.size) {
        fxPop = new Float32Array(board.size);
        fxGlow = new Float32Array(board.size);
      }
      rows = board.rows; cols = board.cols;
    },

    layout(rect, board, deviceRatio, width, height) {
      dpr = deviceRatio;
      vw = width; vh = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      this.resizeFor(board);
      cell = Math.max(26, Math.min((rect.width - 8) / board.cols, (rect.height - 8) / board.rows));
      bx = rect.left + (rect.width - cell * board.cols) / 2;
      by = rect.top + (rect.height - cell * board.rows) / 2;
    },

    /** Ekran koordinatından hücre indisi; tahtanın dışıysa -1. */
    cellAt(x, y, board) {
      const c = Math.floor((x - bx) / cell);
      const r = Math.floor((y - by) / cell);
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return -1;
      return r * board.cols + c;
    },

    center(i) { return { x: cxOf(i), y: cyOf(i) }; },

    pop(i) { if (i < fxPop.length) { fxPop[i] = 1; fxGlow[i] = 1; } },

    burst(i, side, power) {
      const x = cxOf(i), y = cyOf(i);
      const n = Math.round(power * 16 * quality.parts);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283;
        const sp = (55 + Math.random() * 230) * (.6 + power * .3);
        emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
          .34 + Math.random() * .42, cell * (.07 + Math.random() * .13), side);
      }
    },

    burstAt(x, y, side, power) {
      const n = Math.round(power * 16 * quality.parts);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283;
        const sp = (55 + Math.random() * 230) * (.6 + power * .3);
        emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
          .34 + Math.random() * .42, cell * (.07 + Math.random() * .13), side);
      }
    },

    wave(i, side, dur) {
      waves.push({ x: cxOf(i), y: cyOf(i), t: 0, dur, p: side });
    },

    /** Patlayan hücreden komşularına savrulan çekirdek izleri. */
    launch(i, board, side, durSec) {
      const nb = board.nbrs[i];
      for (let m = 0; m < nb.length; m++) {
        comets.push({
          x0: cxOf(i), y0: cyOf(i), x1: cxOf(nb[m]), y1: cyOf(nb[m]),
          t: 0, dur: durSec, p: side
        });
      }
    },

    kick(a) { shakeAmt = Math.min(shakeAmt + a * quality.shake, 16); },
    flash(side, v) { flashSide = side; flashAmt = Math.max(flashAmt, v); },

    clearFx() {
      comets.length = 0;
      waves.length = 0;
      plife.fill(0);
      fxPop.fill(0);
      fxGlow.fill(0);
      shakeAmt = 0; flashAmt = 0;
    },

    step(dt) {
      for (let i = 0; i < POOL; i++) {
        if (plife[i] <= 0) continue;
        plife[i] -= dt;
        px[i] += pvx[i] * dt;
        py[i] += pvy[i] * dt;
        const drag = 1 - 2.6 * dt;
        pvx[i] *= drag; pvy[i] *= drag;
      }
      for (let i = comets.length - 1; i >= 0; i--) {
        const m = comets[i];
        m.t += dt;
        if (Math.random() < .55 * quality.parts) {
          const k = m.t / m.dur, e = k < 1 ? 1 - (1 - k) * (1 - k) : 1;
          emit(m.x0 + (m.x1 - m.x0) * e, m.y0 + (m.y1 - m.y0) * e,
            (Math.random() - .5) * 40, (Math.random() - .5) * 40, .22, cell * .09, m.p);
        }
        if (m.t >= m.dur) comets.splice(i, 1);
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].t += dt;
        if (waves[i].t >= waves[i].dur) waves.splice(i, 1);
      }
      for (let i = 0; i < fxPop.length; i++) {
        fxPop[i] += (0 - fxPop[i]) * Math.min(1, dt * 9);
        fxGlow[i] += (0 - fxGlow[i]) * Math.min(1, dt * 5);
      }
      shakeAmt *= Math.pow(.0016, dt);
      shakeX = (Math.random() - .5) * shakeAmt;
      shakeY = (Math.random() - .5) * shakeAmt;
      flashAmt *= Math.pow(.004, dt);
    },

    render(board, view, T) {
      const g = ctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, vw, vh);
      g.save();
      g.translate(shakeX, shakeY);

      const inset = cell * .055, rad = cell * .24, sz = cell - inset * 2;
      const side = view.side;

      /* — hücreler — */
      for (let i = 0; i < board.size; i++) {
        const owner = board.o[i], count = board.n[i], cap = board.caps[i];
        const x = bx + (i % cols) * cell + inset;
        const y = by + (((i / cols) | 0) * cell) + inset;
        const playable = owner === 0 || owner === side;

        if (owner) {
          const s = SPR.side[owner].tint, d = cell * 1.15;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = .55 + fxGlow[i] * .45;
          g.drawImage(s, cxOf(i) - d / 2, cyOf(i) - d / 2, d, d);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        }

        g.lineWidth = 1;
        g.strokeStyle = owner
          ? rgba(SIDES[owner].rgb, .40 + fxGlow[i] * .5)
          : (playable && !view.over ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.07)');
        roundRect(g, x, y, sz, sz, rad);
        g.stroke();

        if (count === 0) {
          const d = SPR.digit[cap], s = cell * .34;
          if (d) {
            g.globalAlpha = .85;
            g.drawImage(d, cxOf(i) - s / 2, cyOf(i) - s / 2, s, s);
            g.globalAlpha = 1;
          }
        }

        /* kritiğe bir kala: dönen kesikli uyarı halkası */
        if (count > 0 && count === cap - 1) {
          const d = cell * .94;
          g.save();
          g.translate(cxOf(i), cyOf(i));
          g.rotate(T * 1.1);
          g.globalAlpha = .45 + Math.sin(T * 6) * .2;
          g.drawImage(SPR.side[owner].ring, -d / 2, -d / 2, d, d);
          g.restore();
          g.globalAlpha = 1;
        }
      }

      /* — klavye imleci — */
      if (view.cursor >= 0 && view.cursor < board.size && !view.over) {
        const d = cell * (.92 + Math.sin(T * 5) * .03);
        g.globalAlpha = .5 + Math.sin(T * 5) * .12;
        g.drawImage(SPR.cursor, cxOf(view.cursor) - d / 2, cyOf(view.cursor) - d / 2, d, d);
        g.globalAlpha = 1;
      }

      /* — çekirdekler — */
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < board.size; i++) {
        const count = board.n[i];
        if (!count) continue;
        const cap = board.caps[i];
        const tension = count / cap;
        const spin = T * (.7 + tension * tension * 4.2) * (count > 1 ? 1 : .35);
        const orbit = count === 1 ? 0 : cell * (.145 + .02 * Math.sin(T * 3));
        const size = cell * (.60 + fxPop[i] * .34) * (count === 1 ? 1.06 : 1);
        const spr = SPR.side[board.o[i]].orb;
        const bob = count === 1 ? Math.sin(T * 2.2 + (i % cols)) * cell * .02 : 0;
        for (let k = 0; k < count; k++) {
          const a = spin + k * 6.283 / count;
          const ox = cxOf(i) + Math.cos(a) * orbit;
          const oy = cyOf(i) + Math.sin(a) * orbit + bob;
          g.drawImage(spr, ox - size / 2, oy - size / 2, size, size);
        }
      }

      /* — savrulan çekirdekler (izli) — */
      for (let i = 0; i < comets.length; i++) {
        const m = comets[i];
        const k = clamp(m.t / m.dur, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        const spr = SPR.side[m.p].orb, s = cell * .5;
        for (let j = 3; j >= 0; j--) {
          const ee = Math.max(0, e - j * .075);
          g.globalAlpha = (1 - j * .24) * .9;
          g.drawImage(spr,
            m.x0 + (m.x1 - m.x0) * ee - s / 2,
            m.y0 + (m.y1 - m.y0) * ee - s / 2, s, s);
        }
        g.globalAlpha = 1;
      }

      /* — parçacıklar — */
      for (let i = 0; i < POOL; i++) {
        if (plife[i] <= 0) continue;
        const a = plife[i] / pmax[i];
        g.globalAlpha = a * a;
        const s = psize[i] * (.35 + a * .65);
        g.drawImage(SPR.side[pside[i]].spark, px[i] - s / 2, py[i] - s / 2, s, s);
      }
      g.globalAlpha = 1;

      /* — şok halkaları — */
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i], k = w.t / w.dur;
        g.strokeStyle = rgba(SIDES[w.p].rgb, (1 - k) * .55);
        g.lineWidth = cell * .055 * (1 - k) + .6;
        g.beginPath();
        g.arc(w.x, w.y, cell * .2 + k * cell * 1.5, 0, 6.283);
        g.stroke();
      }

      g.globalCompositeOperation = 'source-over';
      g.restore();

      if (flashAmt > .002) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(SIDES[flashSide].rgb, flashAmt * .30);
        g.fillRect(0, 0, vw, vh);
        g.globalCompositeOperation = 'source-over';
      }
    }
  };
}
