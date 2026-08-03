/* NOVA · HUD — DOM tarafının tamamı burada.
 * Oyun mantığı DOM'u tanımaz, HUD da kuralları tanımaz. */

import { SIDES, BOARDS, SERIES, AI_OFF } from './config.js';
import { counter, tween, Ease } from './anim.js';
import { pad2 } from './util.js';

const el = id => document.getElementById(id);

export function createHud() {
  const dom = {
    pod1: el('pod1'), pod2: el('pod2'),
    core1: el('core1'), core2: el('core2'),
    pips1: el('pips1'), pips2: el('pips2'),
    roundNo: el('roundNo'), seriesLbl: el('seriesLbl'),
    aiBadge: el('aiBadge'),
    tugA: el('tugA'), tugB: el('tugB'), tugKnob: el('tugKnob'),
    turnPill: el('turnPill'), turnWho: el('turnWho'),
    chain: el('chain'), chainN: el('chainN'),
    toast: el('toast'), live: el('live'), fps: el('fps'),
    btnUndo: el('btnUndo'), btnNew: el('btnNew'), btnRules: el('btnRules'),
    btnSound: el('btnSound'), btnStart: el('btnStart'), btnNext: el('btnNext'),
    btnSettings: el('btnSettings'),
    modeSeg: el('modeSeg'), boardSeg: el('boardSeg'), seriesSeg: el('seriesSeg'),
    sheetRules: el('sheetRules'), sheetWin: el('sheetWin'),
    winKick: el('winKick'), winTitle: el('winTitle'),
    winTally: el('winTally'), winStreak: el('winStreak')
  };

  const shown = { 1: 0, 2: 0 };
  const handles = { 1: null, 2: null };
  let chainTween = null;
  let toastTimer = null;
  let lastSaid = '';

  /* Tahta ve seri seçicileri config'ten üretilir: seçenek eklemek tek satır. */
  function fillSeg(node, items, valueKey, labelKey) {
    node.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.val = String(it[valueKey]);
      b.textContent = it[labelKey];
      node.appendChild(b);
    }
  }
  fillSeg(dom.boardSeg, BOARDS, 'key', 'label');
  fillSeg(dom.seriesSeg, SERIES, 'key', 'label');

  function markSeg(node, attr, value) {
    for (const b of node.children) {
      b.classList.toggle('on', b.dataset[attr] === String(value));
    }
  }

  function setCores(p, value) {
    if (shown[p] === value) return;
    handles[p] = counter(handles[p], shown[p], value, .4, v => {
      dom['core' + p].textContent = pad2(Math.round(v));
    });
    shown[p] = value;
  }

  return {
    dom,

    /** Ayar panelindeki seçili düğmeleri tazeler. */
    syncSettings(settings) {
      markSeg(dom.modeSeg, 'lv', settings.level);
      markSeg(dom.boardSeg, 'val', settings.board);
      markSeg(dom.seriesSeg, 'val', settings.series);
      dom.aiBadge.hidden = settings.level === AI_OFF;
      dom.btnSound.textContent = settings.sound ? '♪' : '♪̸';
      dom.btnSound.classList.toggle('off', !settings.sound);
      dom.btnSound.setAttribute('aria-pressed', String(settings.sound));
      const s = SERIES.find(x => x.key === settings.series);
      dom.seriesLbl.textContent = s ? s.label : 'İLK ' + settings.series;
    },

    sync(state) {
      const [a, b] = state.counts;
      const total = a + b;
      const pct = total ? (a / total) * 100 : 50;
      dom.tugA.style.width = pct + '%';
      dom.tugB.style.left = pct + '%';
      dom.tugKnob.style.left = pct + '%';
      setCores(1, a);
      setCores(2, b);

      dom.pod1.classList.toggle('live', state.side === 1 && !state.over);
      dom.pod2.classList.toggle('live', state.side === 2 && !state.over);
      dom.roundNo.textContent = pad2(state.round);
      dom.turnWho.textContent = state.thinking ? 'DÜŞÜNÜYOR' : SIDES[state.side].name;
      dom.btnUndo.disabled = !state.canUndo;

      for (const p of [1, 2]) {
        const box = dom['pips' + p];
        if (box.childElementCount !== state.series) {
          box.innerHTML = '';
          for (let i = 0; i < state.series; i++) box.appendChild(document.createElement('span'));
        }
        [...box.children].forEach((s, i) => {
          s.className = 'pip' + (i < state.wins[p] ? ' on' : '');
        });
      }

      if (state.turnChanged) {
        document.documentElement.style.setProperty('--cur', SIDES[state.side].css);
        dom.turnPill.style.setProperty('--c', SIDES[state.side].css);
        tween({
          from: .965, to: 1, dur: .35, ease: Ease.outBack,
          onUpdate: v => { dom.turnPill.style.transform = `scale(${v})`; }
        });
      }
    },

    /** Ekran okuyucuya durum bildirimi (aynı metni tekrar okutmaz). */
    say(text) {
      if (!text || text === lastSaid) return;
      lastSaid = text;
      dom.live.textContent = text;
    },

    toast(text, ms = 1400) {
      dom.toast.textContent = text;
      dom.toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => dom.toast.classList.remove('on'), ms);
    },

    showChain(depth, side) {
      dom.chainN.textContent = '×' + depth;
      dom.chain.style.setProperty('--cur', SIDES[side].css);
      if (chainTween) chainTween.cancel();
      chainTween = tween({
        from: 0, to: 1, dur: .22, ease: Ease.outBack,
        onUpdate: v => {
          dom.chain.style.opacity = String(v);
          dom.chain.style.transform = `translate(-50%,-50%) scale(${.55 + v * .48})`;
        }
      });
    },

    hideChain() {
      if (chainTween) chainTween.cancel();
      const start = parseFloat(dom.chain.style.opacity || '0');
      if (start <= 0) return;
      chainTween = tween({
        from: start, to: 0, dur: .28, ease: Ease.inCubic,
        onUpdate: v => {
          dom.chain.style.opacity = String(v);
          dom.chain.style.transform = `translate(-50%,-50%) scale(${.7 + v * .33})`;
        }
      });
    },

    openSheet(id) {
      const s = dom[id];
      s.classList.add('on');
      const card = s.querySelector('.card');
      tween({
        from: 0, to: 1, dur: .45, ease: Ease.outQuint,
        onUpdate: v => {
          card.style.opacity = String(v);
          card.style.transform = `translateY(${(1 - v) * 28}px) scale(${.96 + v * .04})`;
        }
      });
    },

    closeSheet(id) { dom[id].classList.remove('on'); },
    isSheetOpen() { return dom.sheetRules.classList.contains('on') || dom.sheetWin.classList.contains('on'); },

    showWin({ winner, matchOver, wins, streak }) {
      document.documentElement.style.setProperty('--cur', SIDES[winner].css);
      dom.winKick.textContent = matchOver ? 'MAÇ TAMAMLANDI' : 'TUR TAMAMLANDI';
      dom.winTitle.innerHTML = SIDES[winner].name +
        `<span class="big">${matchOver ? 'MAÇI ALDI' : 'TURU ALDI'}</span>`;
      dom.winTally.textContent = `MAÇ ${wins[1]} — ${wins[2]}`;
      dom.winStreak.textContent = streak || '';
      dom.btnNext.textContent = matchOver ? 'YENİ MAÇ' : 'SONRAKİ TUR';
      dom.btnNext.dataset.reset = matchOver ? '1' : '';
    },

    setFps(text) { dom.fps.textContent = text; },
    showFps(on) { dom.fps.hidden = !on; }
  };
}
