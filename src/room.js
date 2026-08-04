/* NOVA · çevrimiçi oda protokolü — saf mantık ve Firestore değer kodlaması.
 *
 * Ağ yok, DOM yok: burada yalnız "oda belgesi nasıl görünür, sıra kimde,
 * hangi hamle geçerli" soruları var. net.js bunu HTTP'ye, game.js oyuna bağlar.
 *
 * Tahta durumu odada tutulmaz; yalnız **hamle listesi** taşınır. Kural motoru
 * saf ve deterministik olduğu için iki istemci aynı listeden bit bit aynı
 * tahtayı üretir. Bu sayede senkron sorunu diye bir şey kalmaz, üstelik bir tur
 * baştan oynatılabilir hâle gelir.
 */

export const CODE_RE = /^[0-9]{4}$/;

export const isValidCode = code => CODE_RE.test(String(code || ''));

/** 1000–9999 arası oda kodu. */
export function randomCode(rng = Math.random) {
  return String(1000 + Math.floor(rng() * 9000));
}

export function newRoom({ code, host, board, series, now = Date.now() }) {
  return {
    code: String(code),
    host,
    guest: null,
    board,
    series,
    status: 'waiting',      // waiting → playing → ended
    gen: 1,                 // maç kuşağı: rövanşta artar
    round: 1,
    wins1: 0,
    wins2: 0,
    moves: [],              // bu turun hamleleri, sırayla hücre indisleri
    createdAt: now,
    hostSeen: now,
    guestSeen: 0
  };
}

/** Oyuncunun tarafı: kurucu MAGMA (1), katılan AURORA (2), yabancı 0. */
export function sideOf(room, uid) {
  if (!room || !uid) return 0;
  if (room.host === uid) return 1;
  if (room.guest === uid) return 2;
  return 0;
}

/** Turu kim açar: turlar sırayla el değiştirir (tek telefondaki kuralla aynı). */
export const starterFor = round => (round % 2 === 1 ? 1 : 2);

/** Sıradaki taraf, hamle sayısından türetilir. */
export function turnOf(room) {
  const starter = starterFor(room.round);
  return (room.moves.length % 2 === 0) ? starter : 3 - starter;
}

export function isMyTurn(room, uid) {
  if (!room || room.status !== 'playing') return false;
  const side = sideOf(room, uid);
  return side !== 0 && side === turnOf(room);
}

/** Hamle gönderilebilir mi: sıra bende ve elimdeki liste sunucudakiyle aynı mı. */
export function canSubmit(room, uid, expectedCount) {
  return isMyTurn(room, uid) && room.moves.length === expectedCount;
}

/** Rakibin son işareti ne kadar eski (ms). Hiç görülmediyse Infinity. */
export function opponentIdleFor(room, uid, now = Date.now()) {
  const side = sideOf(room, uid);
  if (!side) return Infinity;
  const seen = side === 1 ? room.guestSeen : room.hostSeen;
  return seen ? now - seen : Infinity;
}

/* ── Firestore REST değer kodlaması ─────────────────────────────
   SDK yerine düz REST kullanıldığı için tipli değerleri kendimiz
   çeviriyoruz. Bu sayede oyun sıfır bağımlılıkta kalıyor.        */

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) {
    return v.length ? { arrayValue: { values: v.map(toValue) } } : { arrayValue: {} };
  }
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  throw new Error('desteklenmeyen alan tipi: ' + typeof v);
}

export function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

export function fromValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return Date.parse(val.timestampValue);
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue);
  if ('mapValue' in val) return fromFields(val.mapValue.fields || {});
  return null;
}

export function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}
