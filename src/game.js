/* NOVA · oyun akışı
 *
 * Kuralları engine.js'ten, hamle seçimini ai.js'ten, çizimi renderer.js'ten
 * alır; buradaki iş sıra yönetimi, animasyonlu zincir, geri alma ve girdiler.
 *
 * Asenkron zincirler `epoch` ile damgalanır: tur sıfırlanır ya da geri alınırsa
 * epoch artar ve yarıda kalan zincir bir sonraki beklemede sessizce çekilir.
 */

import {
  createBoard, snapshot, restore, isLegal, legalMoves, place, applyMove,
  criticalCells, detonate, scatter, hasRival, counts, winnerOf
} from './engine.js';
import { pickMove } from './ai.js';
import { createNet, IDLE_LIMIT } from './net.js';
import { sideOf, starterFor, opponentIdleFor } from './room.js';
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

  /* çevrimiçi oda durumu */
  let net = null;
  let online = false, netEnded = false, oppQuiet = false;
  let mySide = 0;        // odada benim tarafım (1 kurucu, 2 katılan)
  let applied = 0;       // odadaki hamle listesinden kaçını işledik
  let netGen = 0;        // maç kuşağı (rövanşta artar)
  const remoteQueue = [];
  let pumping = false;

  function boardSpec() {
    return BOARDS.find(b => b.key === settings.board) || BOARDS[1];
  }
  const isAI = () => settings.level !== AI_OFF;
  const humanSide = () => (isAI() ? 3 - AI_SIDE : side);

  function canUndo() {
    if (online) return false;               // gönderilmiş hamle geri alınamaz
    if (!started || over || busy || thinking || !undoStack.length) return false;
    if (!isAI()) return true;
    return undoStack.some(e => e.side === humanSide());
  }

  const matchIsOver = () => wins[1] >= settings.series || wins[2] >= settings.series;

  function menuState() {
    return {
      started, round, wins, stats, over, online,
      matchOver: matchIsOver(),
      level: settings.level,
      board: settings.board,
      series: settings.series,
      sound: settings.sound,
      haptics: settings.haptics
    };
  }

  function syncHud(turnChanged) {
    // Sıra rakipteyse ya da tur bittiyse ondan haber bekliyoruz: hızlı dinle.
    if (online && net) net.setWaiting(side !== mySide || over || netEnded);
    hud.sync({
      counts: counts(board),
      side, over, round, wins,
      series: settings.series,
      thinking,
      canUndo: canUndo(),
      online, mySide, mine: online && side === mySide,
      turnChanged
    });
    if (turnChanged && !over) {
      hud.say(online
        ? (side === mySide ? 'Sıra sende' : 'Rakip oynuyor')
        : (thinking ? 'Rakip düşünüyor' : SIDES[side].name + ' sırası'));
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

  async function play(i, opts = {}) {
    const { fromAI = false, fromNet = false } = opts;
    if (!started || busy || over) return;
    if (isAI() && side === AI_SIDE && !fromAI) return;
    if (online && !fromNet) {
      if (netEnded) { audio.deny(); hud.toast('ODA KAPANDI'); return; }
      if (side !== mySide) { audio.deny(); haptic(4); hud.toast('SIRA RAKİPTE'); return; }
    }
    if (!isLegal(board, side, i)) {
      audio.deny();
      haptic(4);
      hud.toast('RAKİBİN HÜCRESİ');
      return;
    }

    /* Kendi hamlemi hemen oynayıp aynı anda gönderiyorum: dokunuş anında
       karşılık veriyor, sunucu reddederse tur odadan yeniden kuruluyor. */
    if (online && !fromNet) {
      const expected = applied;
      applied++;
      net.submitMove(i, expected).catch(err => {
        hud.toast(netMessage(err), 1800);
        if (net.room) adoptRound(net.room);
      });
    }

    if (!online) {
      undoStack.push({ snap: snapshot(board), side });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }

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
      play(idx, { fromAI: true });
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

  /* ── çevrimiçi oda ───────────────────────────────────────────── */

  const NET_MSG = {
    offline: 'BAĞLANTI YOK',
    'not-found': 'BÖYLE BİR ODA YOK',
    full: 'ODA DOLU',
    gone: 'ODA KAPANMIŞ',
    own: 'BU SENİN ODAN',
    'bad-code': 'KOD DÖRT HANELİ OLMALI',
    denied: 'ERİŞİM REDDEDİLDİ',
    stale: 'SIRA KAYDI'
  };
  const netMessage = e => NET_MSG[e && e.code] || 'BİR ŞEYLER TERS GİTTİ';

  function ensureNet() {
    if (!net) {
      net = createNet();
      net.on(onRoom, onNetError);
    }
    return net;
  }

  /** Odadaki hamle listesinden turu baştan kurar — animasyonsuz, anında. */
  function adoptRound(room) {
    epoch++;
    remoteQueue.length = 0;
    board = createBoard(boardSpec().rows, boardSpec().cols);
    renderer.resizeFor(board);
    renderer.clearFx();
    hud.hideChain();
    undoStack = [];
    busy = false; thinking = false; over = false;
    side = starterFor(room.round);
    applied = 0;
    for (const mv of room.moves) {
      if (!isLegal(board, side, mv)) break;      // bozuk kayıt: olduğu yerde dur
      applyMove(board, side, mv);
      side = 3 - side;
      applied++;
    }
    if (winnerOf(board)) over = true;
    onLayout();
    syncHud(true);
  }

  function startOnline(room) {
    online = true;
    started = true;
    netEnded = false;
    oppQuiet = false;
    mySide = sideOf(room, net.uid);
    settings = saveSettings({ level: AI_OFF, board: room.board, series: room.series });
    netGen = room.gen;
    round = room.round;
    wins = { 1: room.wins1, 2: room.wins2 };
    streak = { side: 0, count: 0 };
    adoptRound(room);
    hud.syncMenu(menuState());
    hud.closeWin();
    hud.closeMenu();
    hud.toast(mySide === 1 ? 'SEN MAGMA’SIN' : 'SEN AURORA’SIN', 1800);
  }

  /** Rakibin hamleleri sıraya girer, tek tek ve animasyonuyla oynanır. */
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (remoteQueue.length) {
      const mv = remoteQueue.shift();
      if (!isLegal(board, side, mv)) {           // sapma: odadan yeniden kur
        if (net && net.room) adoptRound(net.room);
        break;
      }
      await play(mv, { fromNet: true });
    }
    pumping = false;
  }

  function onRoom(room) {
    if (!online) {
      // Oda ekranında bekliyoruz: rakip girince oyun kendiliğinden başlar.
      if (room.status === 'playing' && sideOf(room, net.uid)) {
        hud.setHostWaiting(false);
        setTimeout(() => { if (!online) startOnline(room); }, 500);
      }
      return;
    }

    if (room.status === 'ended') {
      if (!netEnded) {
        netEnded = true;
        hud.toast('RAKİP ODADAN ÇIKTI', 2400);
        hud.say('Rakip odadan çıktı');
        syncHud();
      }
      return;
    }
    if (room.gen !== netGen || room.round !== round) {
      const rematch = room.gen !== netGen;
      netGen = room.gen;
      round = room.round;
      wins = { 1: room.wins1, 2: room.wins2 };
      if (rematch) streak = { side: 0, count: 0 };
      hud.closeWin();
      adoptRound(room);
      return;
    }
    if (room.moves.length > applied) {
      for (let i = applied; i < room.moves.length; i++) remoteQueue.push(room.moves[i]);
      applied = room.moves.length;
      pump();
    }

    const quiet = opponentIdleFor(room, net.uid) > IDLE_LIMIT;
    if (quiet && !oppQuiet) hud.toast('RAKİPTEN SES YOK', 1800);
    oppQuiet = quiet;
    syncHud();
  }

  function onNetError(e) {
    if (e.code === 'gone') {
      netEnded = true;
      hud.toast('ODA KAPANDI', 2000);
      syncHud();
    } else if (e.code === 'offline') {
      hud.toast('BAĞLANTI YOK', 1600);
    }
  }

  function leaveRoom() {
    const had = online || (net && net.room);
    online = false;
    netEnded = false;
    mySide = 0;
    applied = 0;
    remoteQueue.length = 0;
    if (had) {
      epoch++;
      if (net) net.leave().catch(() => { /* ayrılırken hata önemsiz */ });
    }
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
    leaveRoom();                     // yerel oyuna geçerken odayı bırak
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
    play(i);
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
      case 'Enter':      audio.unlock(); cursorVisible = true; play(cursor); break;
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

    restartRound() {
      if (online) { hud.toast('ÇEVRİMİÇİ TURDA KAPALI', 1400); return; }
      newRound(true);
    },
    nextRound(resetMatch) {
      if (online) {
        hud.closeWin();
        if (netEnded) { hud.toast('ODA KAPANDI', 1600); return; }
        const req = resetMatch ? net.rematch(netGen) : net.nextRound(round, wins);
        req.catch(err => hud.toast(netMessage(err), 1800));
        hud.toast(resetMatch ? 'RÖVANŞ İSTENDİ' : 'RAKİP BEKLENİYOR', 1500);
        return;
      }
      if (resetMatch) { newMatch(); return; }
      round++;
      newRound(false);
    },
    newMatch,
    undo,
    applySettings,

    /* ── çevrimiçi ─────────────────────────────────────────── */

    async hostRoom() {
      hud.netMsg('online', '');
      hud.setHostBusy(true);
      try {
        const client = ensureNet();
        const room = await client.createRoom({ board: settings.board, series: settings.series });
        hud.setHostCode(room.code);
        hud.setHostWaiting(true);
        hud.netMsg('host', '');
        hud.showPanel('host', 1);
      } catch (e) {
        hud.netMsg('online', netMessage(e), 'bad');
      } finally {
        hud.setHostBusy(false);
      }
    },

    async joinRoom(code) {
      hud.netMsg('join', '');
      hud.setJoinBusy(true);
      try {
        const client = ensureNet();
        const room = await client.joinRoom(code);
        startOnline(room);
      } catch (e) {
        hud.netMsg('join', netMessage(e), 'bad');
        haptic(20);
      } finally {
        hud.setJoinBusy(false);
      }
    },

    cancelRoom() {
      leaveRoom();
      hud.setHostCode('');
      hud.setHostWaiting(true);
      hud.showPanel('online', -1);
    },

    leaveRoom() {
      leaveRoom();
      started = false;
      hud.syncMenu(menuState());
      hud.showPanel('home', -1);
      hud.toast('ODADAN ÇIKILDI', 1400);
    },

    roomCode() { return net && net.room ? net.room.code : ''; },
    setNetActive(active) { if (net) net.setActive(active); },

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
