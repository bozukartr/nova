/* NOVA · ortak küçük yardımcılar */

export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const pad2 = v => String(v).padStart(2, '0');

export const REDUCED = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

/** Titreşim: desteklenmeyen ya da hareket azaltılmış cihazda sessizce atlanır. */
export function haptic(ms) {
  if (REDUCED) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* yoksay */ }
}
