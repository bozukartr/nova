/* NOVA · çevrimiçi oda istemcisi
 *
 * Firebase JS SDK yerine düz REST kullanılıyor:
 *   · oyun sıfır bağımlılıkta kalıyor, tek dosya sürümü hâlâ tek dosya,
 *   · CDN'e bağlı değiliz; tek telefon ve AI modları ağa hiç çıkmıyor,
 *   · anonim giriş tek POST, oda belgesi tek GET/PATCH.
 *
 * SDK'nın canlı dinleyicisi olmadığı için oda yoklanır. Sıra rakipteyken
 * sık, bendeyken seyrek: sıra tabanlı bir oyunda fark edilmez, yazma/okuma
 * maliyeti ise düşük kalır.
 *
 * Eşzamanlılık: her yazma, son okunan belgenin `updateTime` damgasını koşul
 * olarak gönderir (Firestore `currentDocument.updateTime`). İki istemci aynı
 * anda yazmaya kalkarsa biri reddedilir ve tazeleyip yeniden dener — kayıp
 * güncelleme olmaz.
 */

import { FIREBASE, ROOM_TTL_HOURS } from './firebase-config.js';
import {
  newRoom, randomCode, isValidCode, toFields, fromFields, sideOf
} from './room.js';

const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
const DOCS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const AUTH_STORE_KEY = 'nova.net.auth.v1';

/* Yoklama temposu, son değişiklikten bu yana geçen süreye göre seyreliyor.
 * Rakip hamlemi görüp cevabını yazana kadar ~1 sn geçiyor; asıl sık yoklanacak
 * pencere o andan sonrası. Uzun düşünen rakipte tempo kendiliğinden düşüyor,
 * böylece hem gecikme hem istek sayısı makul kalıyor. */
export const POLL_PLAN = [
  { after: 0, ms: 450 },        // hamlem yeni gitti, rakip daha yeni görüyor
  { after: 800, ms: 260 },      // cevabın en olası olduğu pencere
  { after: 9000, ms: 700 },
  { after: 30000, ms: 1500 },
  { after: 90000, ms: 3000 }
];
export const POLL_IDLE = 2500;    // sıra bende: yalnız kopmayı gözlüyoruz
export const SEEN_EVERY = 20000;  // "buradayım" damgası
export const IDLE_LIMIT = 70000;  // bu kadar sessizlik = bağlantı koptu

class NetError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export function createNet(opts = {}) {
  const doFetch = opts.fetch || ((...a) => globalThis.fetch(...a));
  const now = opts.now || (() => Date.now());
  const store = opts.store || (typeof localStorage !== 'undefined' ? browserStore() : memoryStore());

  let auth = null;          // { uid, idToken, refreshToken, expiresAt }
  let room = null;          // son okunan oda (düz nesne)
  let updateTime = null;    // son okunan belgenin damgası
  let pollTimer = null;
  let seenAt = 0;
  let onChange = null;
  let onError = null;
  let waiting = false;      // rakipten haber mi bekliyoruz
  let lastChange = 0;       // son değişikliği gördüğümüz an (tempo bunu izler)

  function memoryStore() {
    let v = null;
    return { get: () => v, set: x => { v = x; } };
  }

  /** Anonim kimlik tarayıcıda saklanır: sayfa yenilense de aynı oyuncuyuz. */
  function browserStore() {
    try {
      localStorage.setItem(AUTH_STORE_KEY + '.probe', '1');
      localStorage.removeItem(AUTH_STORE_KEY + '.probe');
      return {
        get() {
          try { return JSON.parse(localStorage.getItem(AUTH_STORE_KEY) || 'null'); } catch { return null; }
        },
        set(v) {
          try { localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(v)); } catch { /* kota */ }
        }
      };
    } catch {
      return memoryStore();
    }
  }

  /** Ağ yoksa istek sonsuza kadar asılı kalmasın: kullanıcı yanıt bekliyor. */
  const REQUEST_TIMEOUT = 9000;

  async function json(url, init = {}) {
    let res;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT) : null;
    try {
      res = await doFetch(url, ctrl ? { ...init, signal: ctrl.signal } : init);
    } catch (e) {
      throw new NetError('bağlantı kurulamadı', 'offline');
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) {
      const status = body && body.error && body.error.status;
      throw new NetError(
        (body && body.error && body.error.message) || 'istek başarısız',
        res.status === 404 ? 'not-found'
          : res.status === 409 || status === 'ALREADY_EXISTS' ? 'exists'
            : res.status === 400 && status === 'FAILED_PRECONDITION' ? 'conflict'
              : status === 'FAILED_PRECONDITION' ? 'conflict'
                : res.status === 401 || res.status === 403 ? 'denied'
                  : 'error'
      );
    }
    return body;
  }

  /* ── kimlik ─────────────────────────────────────────────── */

  async function signIn() {
    const saved = store.get();
    if (saved && saved.refreshToken) {
      auth = saved;
      if (auth.expiresAt - now() > 60000) return auth;
      try { return await refresh(); } catch { /* yenilenemedi: yeni hesap */ }
    }
    const body = await json(`${AUTH_URL}?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    auth = {
      uid: body.localId,
      idToken: body.idToken,
      refreshToken: body.refreshToken,
      expiresAt: now() + Number(body.expiresIn || 3600) * 1000
    };
    store.set(auth);
    return auth;
  }

  async function refresh() {
    const body = await json(`${TOKEN_URL}?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`
    });
    auth = {
      uid: body.user_id || auth.uid,
      idToken: body.id_token,
      refreshToken: body.refresh_token,
      expiresAt: now() + Number(body.expires_in || 3600) * 1000
    };
    store.set(auth);
    return auth;
  }

  async function authed(url, init = {}, retry = true) {
    if (!auth) await signIn();
    if (auth.expiresAt - now() < 60000) await refresh();
    try {
      return await json(url, {
        ...init,
        headers: { ...(init.headers || {}), authorization: `Bearer ${auth.idToken}` }
      });
    } catch (e) {
      if (e.code === 'denied' && retry) {   // jeton eskimişse bir kez tazele
        await refresh();
        return authed(url, init, false);
      }
      throw e;
    }
  }

  /* ── oda belgesi ────────────────────────────────────────── */

  const docUrl = code => `${DOCS}/rooms/${code}`;

  function absorb(doc) {
    room = fromFields(doc.fields);
    updateTime = doc.updateTime;
    return room;
  }

  async function readRoom(code) {
    const doc = await authed(docUrl(code));
    return absorb(doc);
  }

  /** Alan güncellemesi; belge son okuduğumuzdan beri değiştiyse 'conflict'. */
  async function patch(fields, { guard = true } = {}) {
    const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
    const cond = guard && updateTime
      ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      : '';
    const doc = await authed(`${docUrl(room.code)}?${mask}${cond}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: toFields(fields) })
    });
    return absorb(doc);
  }

  /** Çakışmada odayı tazeleyip yeniden dener. */
  async function guarded(build, tries = 3) {
    for (let i = 0; i < tries; i++) {
      const fields = build(room);
      if (!fields) return room;
      try {
        return await patch(fields);
      } catch (e) {
        if (e.code !== 'conflict' || i === tries - 1) throw e;
        await readRoom(room.code);
      }
    }
    return room;
  }

  /* ── genel arayüz ───────────────────────────────────────── */

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function schedule(ms) {
    stopPolling();
    pollTimer = setTimeout(tick, ms);
  }

  /** Sıradaki yoklamaya kaç ms kaldı: bekleyen taraf için plan, diğerinde seyrek. */
  function nextDelay() {
    if (!waiting) return POLL_IDLE;
    const since = now() - lastChange;
    let ms = POLL_PLAN[0].ms;
    for (const step of POLL_PLAN) if (since >= step.after) ms = step.ms;
    return ms;
  }

  async function tick() {
    if (!room) return;
    try {
      const before = JSON.stringify(room);
      await readRoom(room.code);
      if (JSON.stringify(room) !== before) {
        lastChange = now();
        if (onChange) onChange(room);
      }
      heartbeat();            // gecikmeye eklenmesin diye beklemeden
    } catch (e) {
      if (e.code === 'not-found') {
        if (onError) onError(new NetError('oda kapandı', 'gone'));
        stopPolling();
        return;
      }
      if (onError) onError(e);
    }
    if (room) schedule(nextDelay());
  }

  async function heartbeat() {
    if (!room || now() - seenAt < SEEN_EVERY) return;
    const side = sideOf(room, auth.uid);
    if (!side) return;
    seenAt = now();
    try {
      await patch({ [side === 1 ? 'hostSeen' : 'guestSeen']: now() }, { guard: false });
    } catch { /* damga kritik değil */ }
  }

  /** Kendi yazımızdan sonra tempoyu sıfırlayıp hemen dinlemeye geç. */
  function rearm() {
    lastChange = now();
    if (room) schedule(nextDelay());
  }

  const api = {
    get uid() { return auth ? auth.uid : null; },
    get room() { return room; },
    get side() { return sideOf(room, auth && auth.uid); },
    myTurn() {
      if (!room || room.status !== 'playing') return false;
      const starter = room.round % 2 === 1 ? 1 : 2;
      const turn = room.moves.length % 2 === 0 ? starter : 3 - starter;
      return api.side !== 0 && api.side === turn;
    },

    signIn,

    on(change, error) { onChange = change; onError = error; },

    /** Boş bir kod bulana kadar dener; kod belge kimliği olduğu için çakışma atomik. */
    async createRoom({ board, series }) {
      await signIn();
      for (let i = 0; i < 8; i++) {
        const code = randomCode();
        const fresh = newRoom({ code, host: auth.uid, board, series, now: now() });
        fresh.expiresAt = now() + ROOM_TTL_HOURS * 3600 * 1000;
        try {
          const doc = await authed(`${DOCS}/rooms?documentId=${code}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fields: toFields(fresh) })
          });
          absorb(doc);
          seenAt = now();
          waiting = true; rearm();
          return room;
        } catch (e) {
          if (e.code !== 'exists') throw e;
        }
      }
      throw new NetError('boş oda kodu bulunamadı', 'error');
    },

    async joinRoom(code) {
      if (!isValidCode(code)) throw new NetError('kod dört haneli olmalı', 'bad-code');
      await signIn();
      await readRoom(code);
      // Sıra önemli: kapanmış oda, dolu odadan önce gelir.
      if (room.status === 'ended') throw new NetError('oda kapanmış', 'gone');
      if (room.host === auth.uid) throw new NetError('bu senin odan', 'own');
      if (room.guest && room.guest !== auth.uid) throw new NetError('oda dolu', 'full');
      await guarded(r => (r.guest === auth.uid && r.status === 'playing')
        ? null
        : { guest: auth.uid, status: 'playing', guestSeen: now() });
      seenAt = now();
      waiting = true; rearm();
      return room;
    },

    /**
     * Hamleyi listenin sonuna ekler; liste beklediğimden uzunsa reddeder.
     * Yazdıktan hemen sonra dinleme temposu sıfırlanır: sıra artık rakipte,
     * onun cevabını eski (seyrek) zamanlayıcıyla beklemek olmaz.
     */
    async submitMove(index, expectedCount) {
      const res = await guarded(r => {
        if (r.moves.length !== expectedCount) throw new NetError('sıra kaymış', 'stale');
        return { moves: [...r.moves, index] };
      });
      waiting = true;
      rearm();
      return res;
    },

    /** Turu ilerletir. İki oyuncu da basabilir: ikincisi çakışmayı görüp geri çekilir. */
    async nextRound(finishedRound, wins) {
      const res = await guarded(r => {
        if (r.round !== finishedRound) return null;      // rakip zaten ilerletti
        return { round: r.round + 1, moves: [], wins1: wins[1], wins2: wins[2] };
      });
      rearm();
      return res;
    },

    /** Rövanş: kuşak numarası artar, iki istemci de maçı sıfırlar. */
    async rematch(gen) {
      const res = await guarded(r => {
        if (r.gen !== gen) return null;
        return { gen: r.gen + 1, round: 1, moves: [], wins1: 0, wins2: 0, status: 'playing' };
      });
      rearm();
      return res;
    },

    /** Oyun katmanı "rakipten haber bekliyorum" der; tempo buna göre seçilir. */
    setWaiting(value) {
      const next = !!value;
      if (next === waiting) return;
      waiting = next;
      if (next) rearm();
      else if (room) schedule(POLL_IDLE);
    },

    /** Hemen bir yoklama iste (tur bitişi, sekmeye dönüş gibi anlar). */
    wake() { if (room) schedule(0); },

    async leave() {
      stopPolling();
      const current = room;
      room = null;
      if (!current || !auth) return;
      try {
        if (current.host === auth.uid) {
          await authed(`${DOCS}/rooms/${current.code}`, { method: 'DELETE' });
        } else {
          room = current;
          await guarded(() => ({ status: 'ended' }));
          room = null;
        }
      } catch {
        room = null;                                     // ayrılırken hata önemsiz
      }
    },

    /** Sekme arka plana düşünce yoklamayı durdur, dönünce hemen tazele. */
    setActive(active) {
      if (!room) return;
      if (active) { lastChange = now(); schedule(0); } else stopPolling();
    },

    dispose() { stopPolling(); room = null; onChange = null; onError = null; }
  };

  return api;
}
