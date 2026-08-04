/* NOVA · HUD ve menü — DOM tarafının tamamı burada.
 * Oyun mantığı DOM'u tanımaz, HUD da kuralları tanımaz. */

import { SIDES, BOARDS, SERIES, LEVELS, AI_OFF } from './config.js';
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
    turnSub: document.querySelector('.turn .sub'),
    you1: el('you1'), you2: el('you2'),
    chain: el('chain'), chainN: el('chainN'),
    toast: el('toast'), live: el('live'), fps: el('fps'),

    btnUndo: el('btnUndo'), btnNew: el('btnNew'),
    btnSound: el('btnSound'), btnMenu: el('btnMenu'),

    menu: el('menu'),
    mResume: el('mResume'), mResumeT: el('mResumeT'), mResumeSub: el('mResumeSub'),
    mPlay2: el('mPlay2'), mPlayAI: el('mPlayAI'), mAISub: el('mAISub'),
    mLearn: el('mLearn'), mSettings: el('mSettings'), mSetSub: el('mSetSub'),
    mOnline: el('mOnline'), btnLeaveRoom: el('btnLeaveRoom'),
    mHost: el('mHost'), mJoin: el('mJoin'),
    onlineMsg: el('onlineMsg'), hostMsg: el('hostMsg'), joinMsg: el('joinMsg'),
    hostCode: el('hostCode'), hostWait: el('hostWait'),
    btnShareCode: el('btnShareCode'), btnCancelRoom: el('btnCancelRoom'),
    codeBoxes: el('codeBoxes'), keypad: el('keypad'), btnJoinGo: el('btnJoinGo'),
    menuFoot: el('menuFoot'), lvStack: el('lvStack'),
    boardSeg: el('boardSeg'), seriesSeg: el('seriesSeg'),
    swSound: el('swSound'), swHaptic: el('swHaptic'),
    btnResetStats: el('btnResetStats'),

    sheetWin: el('sheetWin'), btnNext: el('btnNext'), btnToMenu: el('btnToMenu'),
    winKick: el('winKick'), winTitle: el('winTitle'),
    winTally: el('winTally'), winStreak: el('winStreak')
  };

  const panels = {};
  for (const node of dom.menu.querySelectorAll('.panel')) panels[node.dataset.panel] = node;
  let panelName = 'home';

  const shown = { 1: 0, 2: 0 };
  const handles = { 1: null, 2: null };
  let chainTween = null;
  let panelTween = null;
  let toastTimer = null;
  let lastSaid = '';

  /* Seçenek satırları config'ten üretilir: yeni seçenek eklemek tek satır. */
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

  /* Zorluk kartları: başlık + tek satır tanım + üç noktalı güç göstergesi. */
  dom.lvStack.innerHTML = '';
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mbtn';
    b.dataset.lv = String(lv.level);
    b.innerHTML =
      `<span class="glyph"><span class="meter">${
        LEVELS.map((_, i) => `<i class="${i <= lv.level ? 'on' : ''}"></i>`).join('')
      }</span></span>` +
      `<span class="txt"><span class="t">${lv.label}</span><span class="s">${lv.desc.toUpperCase()}</span></span>` +
      '<span class="chev" aria-hidden="true">›</span>';
    dom.lvStack.appendChild(b);
  }

  function markSeg(node, value) {
    for (const b of node.children) b.classList.toggle('on', b.dataset.val === String(value));
  }

  function setCores(p, value) {
    if (shown[p] === value) return;
    handles[p] = counter(handles[p], shown[p], value, .4, v => {
      dom['core' + p].textContent = pad2(Math.round(v));
    });
    shown[p] = value;
  }

  function labelOf(list, key) {
    const hit = list.find(x => String(x.key) === String(key));
    return hit ? hit.label : String(key);
  }

  return {
    dom,

    /* ── menü ───────────────────────────────────────────────── */

    showPanel(name, dir = 1) {
      if (!panels[name]) return;
      for (const key of Object.keys(panels)) panels[key].hidden = key !== name;
      panelName = name;
      dom.menu.scrollTop = 0;
      const node = panels[name];
      if (panelTween) panelTween.cancel();
      panelTween = tween({
        from: 0, to: 1, dur: .3, ease: Ease.outQuint,
        onUpdate: v => {
          node.style.opacity = String(v);
          node.style.transform = `translateX(${(1 - v) * 22 * dir}px)`;
        },
        onDone: () => { node.style.transform = ''; }
      });
    },

    openMenu(name = 'home') {
      dom.menu.classList.add('on');
      this.showPanel(name, 1);
      const items = panels[name].querySelectorAll('.mbtn, .row, .learn li');
      items.forEach((node, i) => {
        tween({
          from: 0, to: 1, dur: .34, delay: .04 + i * .045, ease: Ease.outQuint,
          onUpdate: v => {
            node.style.opacity = String(v);
            node.style.transform = `translateY(${(1 - v) * 14}px)`;
          },
          onDone: () => { node.style.transform = ''; node.style.opacity = ''; }
        });
      });
    },

    closeMenu() { dom.menu.classList.remove('on'); },
    isMenuOpen() { return dom.menu.classList.contains('on'); },
    panel() { return panelName; },
    isOverlayOpen() {
      return dom.menu.classList.contains('on') || dom.sheetWin.classList.contains('on');
    },

    /** Menü ve ayar ekranını mevcut duruma göre tazeler. */
    syncMenu(state) {
      /* Tur bittiyse aynı düğme seriyi sürdürür: menü çıkmaz sokak olmasın. */
      dom.mResume.hidden = !state.started;
      dom.mResumeT.textContent = state.over
        ? (state.matchOver ? 'YENİ MAÇ' : 'SONRAKİ TUR')
        : 'DEVAM ET';
      dom.mResumeSub.textContent = state.over
        ? `MAÇ ${state.wins[1]}—${state.wins[2]}`
        : `TUR ${pad2(state.round)} · MAÇ ${state.wins[1]}—${state.wins[2]}`;
      dom.mAISub.textContent = state.level === AI_OFF
        ? 'ZORLUK SEÇ'
        : (LEVELS[state.level] ? LEVELS[state.level].label : 'ZORLUK SEÇ');
      dom.mSetSub.textContent =
        `${labelOf(BOARDS, state.board)} · ${labelOf(SERIES, state.series)}`;
      dom.menuFoot.textContent = (state.stats[1] || state.stats[2])
        ? `TOPLAM ${state.stats[1]} — ${state.stats[2]}`
        : '';

      for (const b of dom.lvStack.children) {
        b.classList.toggle('sel', +b.dataset.lv === state.level);
        b.style.setProperty('--c', 'var(--p2)');
      }
      markSeg(dom.boardSeg, state.board);
      markSeg(dom.seriesSeg, state.series);
      dom.swSound.setAttribute('aria-checked', String(state.sound));
      dom.swHaptic.setAttribute('aria-checked', String(state.haptics));

      dom.btnLeaveRoom.hidden = !state.online;
      dom.aiBadge.hidden = state.level === AI_OFF || state.online;
      dom.btnSound.textContent = state.sound ? '♪' : '♪̸';
      dom.btnSound.classList.toggle('off', !state.sound);
      dom.btnSound.setAttribute('aria-pressed', String(state.sound));
      dom.seriesLbl.textContent = labelOf(SERIES, state.series);
    },

    /* ── online panelleri ───────────────────────────────────── */

    /** which: 'online' | 'host' | 'join' · kind: '' | 'bad' | 'good' */
    netMsg(which, text = '', kind = '') {
      const node = dom[which + 'Msg'];
      if (!node) return;
      node.textContent = text;
      node.className = 'netmsg' + (kind ? ' ' + kind : '');
    },

    setHostCode(code) { dom.hostCode.textContent = code || '····'; },

    setHostWaiting(waiting, text) {
      dom.hostWait.classList.toggle('done', !waiting);
      dom.hostWait.querySelector('span').textContent =
        text || (waiting ? 'RAKİP BEKLENİYOR' : 'RAKİP GELDİ');
    },

    /** Kod kutularını doldurur ve KATIL düğmesini uygunluğa göre açar. */
    setCodeInput(value) {
      const digits = String(value || '');
      [...dom.codeBoxes.children].forEach((box, i) => {
        box.textContent = digits[i] || '';
        box.classList.toggle('filled', !!digits[i]);
        box.classList.toggle('next', i === digits.length);
      });
      dom.btnJoinGo.disabled = digits.length !== 4;
    },

    setJoinBusy(busy) {
      dom.btnJoinGo.disabled = busy || [...dom.codeBoxes.children].some(b => !b.textContent);
      dom.btnJoinGo.textContent = busy ? 'KATILIYOR…' : 'KATIL';
    },

    setHostBusy(busy) {
      dom.mHost.disabled = busy;
      dom.mHost.querySelector('.s').textContent = busy ? 'ODA AÇILIYOR…' : 'DÖRT HANELİ KOD ÜRET';
    },

    /* ── oyun içi HUD ───────────────────────────────────────── */

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
      /* Çevrimiçi oyunda taraf adı yerine "sıra kimde" bilgisi daha yararlı. */
      dom.turnWho.textContent = state.online
        ? (state.mine ? 'SIRA SENDE' : 'RAKİP OYNUYOR')
        : (state.thinking ? 'DÜŞÜNÜYOR' : SIDES[state.side].name);
      if (dom.turnSub) dom.turnSub.hidden = !!state.online;
      dom.you1.hidden = !(state.online && state.mySide === 1);
      dom.you2.hidden = !(state.online && state.mySide === 2);
      dom.btnUndo.disabled = !state.canUndo;
      dom.btnNew.disabled = !!state.online;

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

    openWin() {
      dom.sheetWin.classList.add('on');
      const card = dom.sheetWin.querySelector('.card');
      tween({
        from: 0, to: 1, dur: .45, ease: Ease.outQuint,
        onUpdate: v => {
          card.style.opacity = String(v);
          card.style.transform = `translateY(${(1 - v) * 28}px) scale(${.96 + v * .04})`;
        }
      });
    },

    closeWin() { dom.sheetWin.classList.remove('on'); },

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
