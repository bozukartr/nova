/* NOVA · oyun akışı
 *
 * Kuralları engine.js'ten, hamle seçimini ai.js'ten, çizimi renderer.js'ten
 * alır; buradaki iş sıra yönetimi, animasyonlu zincir, geri alma ve girdiler.
 *
 * Asenkron zincirler `epoch` ile damgalanır: tur sıfırlanır ya da geri alınırsa
 * epoch artar ve yarıda kalan zincir bir sonraki beklemede sessizce çekilir.
 */

import {
  createBoard, snapshot, restore, isLegal, legalMoves, place,
  criticalCells, detonate, scatter, hasRival, counts, winnerOf
} from './engine.js';
import { pickMove } from './ai.js';
import { SIDES, BOARDS, TRAVEL_MS, SETTLE_MS, AI_SIDE, AI_OFF } from './config.js';
import { loadSettings, saveSettings } from './storage.js';
import { sleep, haptic, setHaptics } from './util.js';

const UNDO_LIMIT = 80;

export function createGame({ renderer, hud, audio, canvas, onLayout }) {
  let settings = loadSettings();
  let board = createBoard(boardSpec().rows, boardSpec().cols);

  let side = 1, round = 1;
  let wins = { 1: 0, 2: 0 };
  let stats = { 1: settings.stats1 || 0, 2: settings.stats2 || 0 };
  let streak = { side: 0, count: 0 };
  let over = false, busy = false, thinking = false, started = false;
  let epoch = 0;
  let undoStack = [];
  let cursor = 0, cursorVisible = false;

  function boardSpec() {
    return BOARDS.find(b => b.key === settings.board) || BOARDS[1];
  }
  const isAI = () => settings.level !== AI_OFF;
  const humanSide = () => (isAI() ? 3 - AI_SIDE : side);

  function canUndo() {
    if (!started || over || busy || thinking || !undoStack.length) return false;
    if (!isAI()) return true;
    return undoStack.some(e => e.side === humanSide());
  }

  const matchIsOver = () => wins[1] >= settings.series || wins[2] >= settings.series;

  function menuState() {
    return {
      started, round, wins, stats, over,
      matchOver: matchIsOver(),
      level: settings.level,
      board: settings.board,
      series: settings.series,
      sound: settings.sound,
      haptics: settings.haptics
    };
  }

  function syncHud(turnChanged) {
    hud.sync({
      counts: counts(board),
      side, over, round, wins,
      series: settings.series,
      thinking,
      canUndo: canUndo(),
      turnChanged
    });
    if (turnChanged && !over) {
      hud.say(thinking ? 'Rakip düşünüyor' : SIDES[side].name + ' sırası');
    }
  }

  /* ── tur yaşam döngüsü ───────────────────────────────────────── */

  function newRound(sameStarter) {
    epoch++;
    board = createBoard(boardSpec().rows, boardSpec().cols);
    renderer.resizeFor(board);
    renderer.clearFx();
    hud.hideChain();
    undoStack = [];
    over = false; busy = false; thinking = false;
    cursor = Math.min(cursor, board.size - 1);
    if (!sameStarter) side = round % 2 === 1 ? 1 : 2;
    onLayout();
    syncHud(true);
    maybeAI();
  }

  function newMatch() {
    wins = { 1: 0, 2: 0 };
    streak = { side: 0, count: 0 };
    round = 1;
    newRound(false);
  }

  function finishRound(winner) {
    over = true;
    hud.hideChain();
    wins[winner]++;
    streak = streak.side === winner
      ? { side: winner, count: streak.count + 1 }
      : { side: winner, count: 1 };

    const matchOver = wins[winner] >= settings.series;
    if (matchOver) {
      stats[winner]++;
      settings = saveSettings({ stats1: stats[1], stats2: stats[2] });
    }

    const my = epoch;
    for (let i = 0; i < 26; i++) {
      setTimeout(() => {
        if (my !== epoch) return;
        const c = renderer.center((Math.random() * board.size) | 0);
        renderer.burstAt(c.x, c.y, winner, 1.1);
      }, i * 45);
    }
    renderer.kick(14);
    renderer.flash(winner, 1);
    audio.win();
    haptic(160);
    syncHud();
    hud.say(SIDES[winner].name + (matchOver ? ' maçı aldı' : ' turu aldı'));

    hud.showWin({
      winner, matchOver, wins,
      streak: matchOver
        ? `TOPLAM ${stats[1]} — ${stats[2]}`
        : (streak.count >= 2 ? `${SIDES[winner].name} ÜST ÜSTE ${streak.count}` : '')
    });
    setTimeout(() => { if (my === epoch) hud.openWin(); }, 900);
  }

  /* ── hamle ve zincir ─────────────────────────────────────────── */

  async function runCascade(mover) {
    const my = epoch;
    const buf = new Int32Array(board.size);
    let depth = 0;

    while (depth < 512) {
      if (my !== epoch) return true;
      if (!hasRival(board, mover)) break;      // tek renk kaldı: zincir anlamsız
      const k = criticalCells(board, buf);
      if (!k) break;
      depth++;

      if (depth >= 2) hud.showChain(depth, mover);
      renderer.kick(3 + Math.min(depth, 7) * 1.6 + k * .7);
      renderer.flash(mover, Math.min(1, .28 + depth * .10));
      audio.nova(depth);
      haptic(14 + depth * 5);

      for (let j = 0; j < k; j++) {
        renderer.burst(buf[j], mover, 1 + Math.min(depth, 4) * .22);
        renderer.wave(buf[j], mover, .42);
        renderer.launch(buf[j], board, mover, TRAVEL_MS / 1000);
      }
      detonate(board, buf, k);
      syncHud();

      await sleep(TRAVEL_MS);
      if (my !== epoch) return true;

      scatter(board, buf, k, mover);
      for (let j = 0; j < k; j++) {
        const nb = board.nbrs[buf[j]];
        for (let m = 0; m < nb.length; m++) {
          renderer.pop(nb[m]);
          renderer.burst(nb[m], mover, .35);
        }
      }
      audio.land();
      syncHud();

      const w = winnerOf(board);
      if (w) { finishRound(w); return false; }

      await sleep(SETTLE_MS);
      if (my !== epoch) return true;
    }
    hud.hideChain();
    return false;
  }

  async function play(i, fromAI) {
    if (!started || busy || over) return;
    if (isAI() && side === AI_SIDE && !fromAI) return;
    if (!isLegal(board, side, i)) {
      audio.deny();
      haptic(4);
      hud.toast('RAKİBİN HÜCRESİ');
      return;
    }

    undoStack.push({ snap: snapshot(board), side });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();

    const my = epoch;
    busy = true;
    place(board, side, i);
    renderer.pop(i);
    renderer.burst(i, side, .45);
    renderer.wave(i, side, .34);
    audio.drop(board.n[i]);
    haptic(9);
    syncHud();

    const aborted = await runCascade(side);
    if (aborted || my !== epoch) return;
    if (!over) {
      side = 3 - side;
      busy = false;
      syncHud(true);
      maybeAI();
    }
  }

  function maybeAI() {
    if (!isAI() || over || !started || side !== AI_SIDE) return;
    const my = epoch;
    thinking = true;
    syncHud(true);
    setTimeout(() => {
      if (my !== epoch || over || !started) { thinking = false; return; }
      let idx = -1;
      try {
        idx = pickMove(board, AI_SIDE, settings.level);
      } catch {
        idx = -1;
      }
      thinking = false;
      if (my !== epoch || over) return;
      if (idx < 0 || !isLegal(board, AI_SIDE, idx)) {
        const moves = legalMoves(board, AI_SIDE);
        idx = moves.length ? moves[(Math.random() * moves.length) | 0] : -1;
      }
      if (idx < 0) return;
      cursorVisible = false;
      play(idx, true);
    }, 380 + Math.random() * 280);
  }

  function undo() {
    if (!canUndo()) return;
    epoch++;                       // bekleyen AI zamanlayıcısı / zinciri iptal
    thinking = false;
    busy = false;

    let entry = undoStack.pop();
    if (isAI()) {
      while (entry && entry.side !== humanSide() && undoStack.length) entry = undoStack.pop();
    }
    restore(board, entry.snap);
    side = entry.side;

    renderer.clearFx();
    hud.hideChain();
    audio.undo();
    hud.toast('GERİ ALINDI');
    syncHud(true);
  }

  /* ── ayarlar ─────────────────────────────────────────────────── */

  function applySettings(patch) {
    const before = { ...settings };
    settings = saveSettings(patch);
    setHaptics(settings.haptics);
    hud.syncMenu(menuState());
    // Tahta ya da seri değişince tur ortasında kalan maç anlamını yitirir.
    if (before.board !== settings.board || before.series !== settings.series) newMatch();
    else syncHud(true);
  }

  /** Menüden oyun başlatma: mod uygulanır ve her hâlükârda yeni maç açılır. */
  function startGame(level) {
    settings = saveSettings({ level });
    started = true;
    hud.syncMenu(menuState());
    hud.closeWin();
    hud.closeMenu();
    newMatch();
  }

  /* ── girdi ───────────────────────────────────────────────────── */

  canvas.addEventListener('pointerdown', e => {
    audio.unlock();
    if (hud.isOverlayOpen()) return;
    const i = renderer.cellAt(e.clientX, e.clientY, board);
    if (i < 0) return;
    cursorVisible = false;
    play(i, false);
  }, { passive: true });

  /* Klavye desteği masaüstü için sessizce açık: menüde tanıtılmıyor. */
  addEventListener('keydown', e => {
    const k = e.key;
    if (hud.isOverlayOpen()) {
      if (k === 'Escape' && hud.isMenuOpen()) {
        if (hud.panel() !== 'home') hud.showPanel('home', -1);
        else if (started) hud.closeMenu();
        e.preventDefault();
      }
      return;
    }
    if (k === 'Escape') { api.openMenu(); e.preventDefault(); return; }

    const cols = board.cols;
    let handled = true;
    switch (k) {
      case 'ArrowLeft':  cursor = cursor % cols === 0 ? cursor : cursor - 1; cursorVisible = true; break;
      case 'ArrowRight': cursor = cursor % cols === cols - 1 ? cursor : cursor + 1; cursorVisible = true; break;
      case 'ArrowUp':    cursor = cursor - cols < 0 ? cursor : cursor - cols; cursorVisible = true; break;
      case 'ArrowDown':  cursor = cursor + cols >= board.size ? cursor : cursor + cols; cursorVisible = true; break;
      case ' ':
      case 'Enter':      audio.unlock(); cursorVisible = true; play(cursor, false); break;
      case 'z': case 'Z': undo(); break;
      case 'r': case 'R': newRound(true); break;
      case 'm': case 'M': api.setSound(!settings.sound); break;
      case '?': api.openMenu('learn'); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  const api = {
    get board() { return board; },
    get settings() { return settings; },
    view() {
      return { side, over, cursor: cursorVisible ? cursor : -1 };
    },
    tintRgb() { return SIDES[side].rgb; },

    playHuman() { startGame(AI_OFF); },
    playAI(level) { startGame(level); },
    resume() {
      hud.closeWin();
      hud.closeMenu();
      if (over) { this.nextRound(matchIsOver()); return; }
      syncHud(true);
    },
    openMenu(panel = 'home') {
      hud.syncMenu(menuState());
      hud.closeWin();
      hud.openMenu(panel);
    },

    restartRound() { newRound(true); },
    nextRound(resetMatch) {
      if (resetMatch) { newMatch(); return; }
      round++;
      newRound(false);
    },
    newMatch,
    undo,
    applySettings,

    setSound(on) {
      audio.setEnabled(on);
      settings = saveSettings({ sound: audio.enabled });
      hud.syncMenu(menuState());
      if (started) hud.toast(audio.enabled ? 'SES AÇIK' : 'SES KAPALI', 900);
    },
    setHaptics(on) {
      settings = saveSettings({ haptics: !!on });
      setHaptics(settings.haptics);
      hud.syncMenu(menuState());
      if (settings.haptics) haptic(18);
    },
    resetStats() {
      stats = { 1: 0, 2: 0 };
      settings = saveSettings({ stats1: 0, stats2: 0 });
      hud.syncMenu(menuState());
      hud.toast('İSTATİSTİKLER SIFIRLANDI', 1100);
    },

    refresh() { syncHud(); },
    boot() {
      setHaptics(settings.haptics);
      hud.syncMenu(menuState());
      newMatch();
      hud.openMenu('home');
    }
  };
  return api;
}
