/* NOVA · AI rakip
 *
 * Negamax + alfa-beta, hamle sıralaması ve zaman bütçeli iteratif derinleşme.
 * Arama tahtanın kopyaları üzerinde döner; gerçek oyun durumuna hiç dokunmaz
 * ve kuralları engine.js'ten alır (kural kopyası yok).
 */

import { cloneBoard, legalMoves, applyMove, hasRival } from './engine.js';
import { LEVELS } from './config.js';

const WIN = 1e6;
const defaultNow = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * Konum değerlendirmesi (`me` açısından).
 * Köşe > kenar > orta: kapasitesi düşük hücre daha az saldırıya açık.
 * Yanında patlamaya bir kala düşman varsa hücre borç yazılır.
 */
export function evaluate(b, me) {
  const { n, o, caps, nbrs, size } = b;
  let mine = 0, theirs = 0, score = 0;

  for (let i = 0; i < size; i++) {
    const cnt = n[i];
    if (!cnt) continue;
    const own = o[i];
    const cap = caps[i];
    if (own === me) mine += cnt; else theirs += cnt;

    let w = cap === 2 ? 3.4 : cap === 3 ? 2.1 : 1.0;
    const nb = nbrs[i];
    let vulnerable = false;
    for (let m = 0; m < nb.length; m++) {
      const q = nb[m];
      if (n[q] && o[q] !== own && n[q] >= caps[q] - 1) { vulnerable = true; break; }
    }
    if (vulnerable) w -= 3.0;          // komşu düşman tek dokunuşla burayı yutar
    else if (cnt === cap - 1) w += 1.6; // güvende ve tetikte

    score += own === me ? w * cnt : -w * cnt;
  }

  // Eleme yalnızca iki taraf da oynadıktan sonra anlamlı.
  if (b.played[1] && b.played[2]) {
    if (mine > 0 && theirs === 0) return WIN;
    if (theirs > 0 && mine === 0) return -WIN;
  }
  return score + (mine - theirs) * 0.8;
}

/** Bir düğümün çocukları: her yasal hamle uygulanmış tahta kopyaları. */
function expand(b, side) {
  const moves = legalMoves(b, side);
  const kids = [];
  for (let j = 0; j < moves.length; j++) {
    const i = moves[j];
    const child = cloneBoard(b);
    applyMove(child, side, i);
    kids.push({ move: i, board: child, score: evaluate(child, side) });
  }
  kids.sort((p, q) => q.score - p.score);
  return kids;
}

function search(b, me, depth, alpha, beta, ctx, ply) {
  const kids = expand(b, me);
  if (!kids.length) return { value: -WIN + ply, move: -1 };

  let best = -Infinity;
  let bestMove = kids[0].move;
  const width = Math.min(kids.length, ctx.width);

  for (let j = 0; j < width; j++) {
    const kid = kids[j];
    let v;
    const terminal = Math.abs(kid.score) >= WIN || !hasRival(kid.board, me);
    if (depth <= 1 || terminal || ctx.now() > ctx.deadline) {
      // Yaprak: erken kazanç geç kazançtan iyidir.
      v = terminal && kid.score >= WIN ? WIN - ply : kid.score;
    } else {
      v = -search(kid.board, 3 - me, depth - 1, -beta, -alpha, ctx, ply + 1).value;
    }
    if (v > best) { best = v; bestMove = kid.move; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return { value: best, move: bestMove };
}

/**
 * Seçilen hamlenin hücre indisi; oynanacak hamle yoksa -1.
 * opts: { now, rng, budget } — testlerde deterministik kılmak için enjekte edilir.
 */
export function pickMove(board, side, level, opts = {}) {
  const cfg = LEVELS[level] || LEVELS[LEVELS.length - 1];
  const now = opts.now || defaultNow;
  const rng = opts.rng || Math.random;

  const moves = legalMoves(board, side);
  if (!moves.length) return -1;

  // Kolay/normal seviyede kasıtlı hata payı: rakip insan gibi aksasın.
  if (cfg.noise > 0 && rng() < cfg.noise) {
    return moves[Math.min(moves.length - 1, (rng() * moves.length) | 0)];
  }

  const ctx = {
    now,
    deadline: now() + (opts.budget ?? cfg.budget),
    width: cfg.width
  };

  let bestMove = moves[0];
  for (let d = 1; d <= cfg.depth; d++) {
    const res = search(board, side, d, -Infinity, Infinity, ctx, 0);
    if (res.move >= 0) bestMove = res.move;
    if (Math.abs(res.value) >= WIN) break;   // kazanan/kaybeden hat bulundu
    if (now() > ctx.deadline) break;         // bütçe doldu, elde olanla yetin
  }
  return bestMove;
}
