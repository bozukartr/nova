/* NOVA · minik tween motoru
 *
 * Eskiden bu iş için CDN'den GSAP çekiliyordu: 70 KB bağımlılık, üstelik
 * ağ yoksa animasyonlar sessizce kayboluyordu. İhtiyacımız olan üç eğri
 * ve bir zamanlayıcı; ikisi de burada, ~60 satırda.
 *
 * Tween'ler oyunun ana döngüsünden beslenir (kendi rAF'ları yok), böylece
 * sekme arka plana düştüğünde onlar da duruyor.
 */

export const Ease = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inCubic: t => t * t * t,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2)
};

const active = new Set();

export function tween(opts) {
  const t = {
    from: opts.from ?? 0,
    to: opts.to ?? 1,
    dur: Math.max(0.001, opts.dur ?? 0.3),
    delay: opts.delay ?? 0,
    ease: opts.ease || Ease.outCubic,
    onUpdate: opts.onUpdate,
    onDone: opts.onDone,
    elapsed: 0,
    done: false,
    cancel() { this.done = true; active.delete(this); }
  };
  if (t.onUpdate) t.onUpdate(t.from, 0);
  active.add(t);
  return t;
}

/** Sayı sayacı: mevcut tween'i iptal edip yenisini başlatır. */
export function counter(handle, from, to, dur, onUpdate) {
  if (handle) handle.cancel();
  return tween({ from, to, dur, ease: Ease.outCubic, onUpdate });
}

export function updateTweens(dt) {
  if (!active.size) return;
  for (const t of active) {
    if (t.delay > 0) { t.delay -= dt; continue; }
    t.elapsed += dt;
    const k = Math.min(1, t.elapsed / t.dur);
    const v = t.from + (t.to - t.from) * t.ease(k);
    if (t.onUpdate) t.onUpdate(v, k);
    if (k >= 1) {
      t.done = true;
      active.delete(t);
      if (t.onDone) t.onDone();
    }
  }
}

export function stopAllTweens() {
  for (const t of active) t.done = true;
  active.clear();
}
