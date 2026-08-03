/* NOVA · kural motoru
 *
 * Saf veri + saf fonksiyon: DOM yok, zamanlayıcı yok, çizim yok.
 * Hem ekrandaki oyun hem de AI aramasi *tam olarak bu* fonksiyonları
 * kullanır; kurallar tek yerde tanımlı olduğu için ikisi asla ayrışamaz.
 *
 * Tahta düz dizilerle tutulur:
 *   n[i] → hücredeki çekirdek sayısı
 *   o[i] → sahibi (0 boş, 1 MAGMA, 2 AURORA)
 */

const geoCache = new Map();

/** rows×cols geometrisi (kapasite + komşu tabloları) bir kez üretilir, paylaşılır. */
function geometry(rows, cols) {
  const key = rows + 'x' + cols;
  const hit = geoCache.get(key);
  if (hit) return hit;

  const size = rows * cols;
  const caps = new Uint8Array(size);
  const nbrs = new Array(size);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const a = [];
      if (r > 0) a.push(i - cols);
      if (r < rows - 1) a.push(i + cols);
      if (c > 0) a.push(i - 1);
      if (c < cols - 1) a.push(i + 1);
      nbrs[i] = Int32Array.from(a);
      caps[i] = a.length; // köşe 2 · kenar 3 · orta 4
    }
  }
  const geo = { rows, cols, size, caps, nbrs };
  geoCache.set(key, geo);
  return geo;
}

export function createBoard(rows, cols) {
  const geo = geometry(rows, cols);
  return {
    rows: geo.rows, cols: geo.cols, size: geo.size,
    caps: geo.caps, nbrs: geo.nbrs,
    n: new Uint8Array(geo.size),
    o: new Uint8Array(geo.size),
    played: [false, false, false] // 1 ve 2 indisleri kullanılır
  };
}

export function cloneBoard(b) {
  return {
    rows: b.rows, cols: b.cols, size: b.size,
    caps: b.caps, nbrs: b.nbrs,
    n: b.n.slice(), o: b.o.slice(),
    played: b.played.slice()
  };
}

/** Kaydedilebilir sade nesne (localStorage / geri alma yığını için). */
export function snapshot(b) {
  return { n: Array.from(b.n), o: Array.from(b.o), played: b.played.slice() };
}

export function restore(b, snap) {
  b.n.set(snap.n);
  b.o.set(snap.o);
  b.played = snap.played.slice();
  return b;
}

export const indexOf = (b, r, c) => r * b.cols + c;
export const rowOf = (b, i) => (i / b.cols) | 0;
export const colOf = (b, i) => i % b.cols;

/** Bir hamle geçerli mi: boş hücre ya da kendi rengin. */
export function isLegal(b, side, i) {
  return i >= 0 && i < b.size && (b.o[i] === 0 || b.o[i] === side);
}

export function legalMoves(b, side, out) {
  const dst = out || [];
  let k = 0;
  for (let i = 0; i < b.size; i++) {
    if (b.o[i] === 0 || b.o[i] === side) { dst[k++] = i; }
  }
  if (!out) dst.length = k;
  return out ? k : dst;
}

/** Kapasiteye ulaşmış hücreleri `out`a yazar, sayısını döndürür. */
export function criticalCells(b, out) {
  let k = 0;
  for (let i = 0; i < b.size; i++) {
    if (b.n[i] >= b.caps[i] && b.n[i] > 0) out[k++] = i;
  }
  return k;
}

/** Patlayan hücrelerden kapasite kadar çekirdek düşer (savrulma anı). */
export function detonate(b, cells, k) {
  for (let j = 0; j < k; j++) {
    const i = cells[j];
    b.n[i] -= b.caps[i];
    if (b.n[i] <= 0) { b.n[i] = 0; b.o[i] = 0; }
  }
}

/** Savrulan çekirdekler komşulara düşer ve komşuları patlatan tarafa çevirir. */
export function scatter(b, cells, k, side) {
  for (let j = 0; j < k; j++) {
    const nb = b.nbrs[cells[j]];
    for (let m = 0; m < nb.length; m++) {
      const q = nb[m];
      b.n[q]++;
      b.o[q] = side;
    }
  }
}

/** Karşı tarafın sahada tek bir çekirdeği kaldı mı? */
export function hasRival(b, side) {
  for (let i = 0; i < b.size; i++) {
    if (b.n[i] && b.o[i] && b.o[i] !== side) return true;
  }
  return false;
}

/** Çekirdeği yerleştirir. Geçersiz hamlede false döner, tahtaya dokunmaz. */
export function place(b, side, i) {
  if (!isLegal(b, side, i)) return false;
  b.n[i]++;
  b.o[i] = side;
  b.played[side] = true;
  return true;
}

/**
 * Zinciri sonuna kadar (senkron) çözer — AI ve testler için.
 * Ekrandaki oyun aynı adımları tek tek, araya animasyon koyarak çalıştırır.
 * Tek renk kaldığında zincir sonsuza gitmesin diye erken durur.
 */
export function resolve(b, side, opts = {}) {
  const maxSteps = opts.maxSteps ?? 512;
  const buf = opts.buf || new Int32Array(b.size);
  let steps = 0;
  while (steps < maxSteps) {
    if (!hasRival(b, side)) break;
    const k = criticalCells(b, buf);
    if (!k) break;
    steps++;
    detonate(b, buf, k);
    scatter(b, buf, k, side);
    if (opts.onStep) opts.onStep(buf, k, steps);
  }
  return steps;
}

/** Hamle + zincir, tek çağrıda. Geçersiz hamlede -1. */
export function applyMove(b, side, i, opts) {
  if (!place(b, side, i)) return -1;
  return resolve(b, side, opts);
}

export function counts(b) {
  let a = 0, x = 0;
  for (let i = 0; i < b.size; i++) {
    const v = b.n[i];
    if (!v) continue;
    if (b.o[i] === 1) a += v; else if (b.o[i] === 2) x += v;
  }
  return [a, x];
}

/**
 * Turu kazanan taraf, yoksa 0.
 * İki taraf da en az bir hamle yapmadan kimse elenmiş sayılmaz —
 * aksi halde açılış hamlesi anında "kazandın" olurdu.
 */
export function winnerOf(b) {
  if (!b.played[1] || !b.played[2]) return 0;
  const [a, x] = counts(b);
  if (a > 0 && x === 0) return 1;
  if (x > 0 && a === 0) return 2;
  return 0;
}
