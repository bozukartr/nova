/* NOVA · ses — WebAudio ile sentezlenir, tek bir ses dosyası yok.
 *
 * Master bus'ta kompresör var: derin zincirlerde üst üste binen sesler
 * kırpmak yerine sıkışıyor. Ayrıca eşzamanlı ses tavanı uygulanır.
 */

export function createAudio(enabled = true) {
  let ac = null, noise = null, master = null;
  let on = enabled;
  let voices = 0;

  function ready() {
    if (!ac) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ac = new Ctor();

      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 24;
      comp.ratio.value = 10;
      comp.attack.value = .003;
      comp.release.value = .22;

      master = ac.createGain();
      master.gain.value = .8;
      master.connect(comp);
      comp.connect(ac.destination);

      const len = Math.floor(ac.sampleRate * .5);
      noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function slot(dur) {
    if (voices >= 9) return false;
    voices++;
    setTimeout(() => { voices--; }, dur * 1000 + 50);
    return true;
  }

  function tone(f, f2, dur, type, vol) {
    if (!on) return;
    const a = ready();
    if (!a || !slot(dur)) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(a.currentTime + dur);
  }

  function hit(cut, dur, vol) {
    if (!on) return;
    const a = ready();
    if (!a || !slot(dur)) return;
    const s = a.createBufferSource();
    s.buffer = noise;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cut, a.currentTime);
    f.frequency.exponentialRampToValueAtTime(180, a.currentTime + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(a.currentTime + dur);
  }

  return {
    get enabled() { return on; },
    setEnabled(next) {
      on = !!next;
      if (on) { ready(); tone(880, 1320, .08, 'triangle', .10); }
      return on;
    },
    toggle() { return this.setEnabled(!on); },
    /** İlk kullanıcı dokunuşunda çağrılır: iOS ses bağlamını burada açar. */
    unlock() { try { if (on) ready(); } catch { /* yoksay */ } },
    drop(n) { tone(360 + n * 90, 220 + n * 60, .10, 'triangle', .11); },
    deny() { tone(150, 110, .09, 'sine', .09); },
    undo() { tone(420, 260, .12, 'sine', .075); },
    /* Derin zincirde ses yükselmiyor, tınısı koyulaşıyor: kırpma yerine karakter. */
    nova(depth) {
      const k = Math.min(depth, 6);
      hit(2600 + k * 380, .30, .17 - k * .012);
      tone(300 + k * 66, 70, .30, 'sawtooth', .09 - k * .006);
    },
    land() { tone(620, 420, .07, 'sine', .055); },
    win() {
      [523, 659, 784, 1175].forEach((f, i) => setTimeout(() => tone(f, f * 1.5, .28, 'triangle', .11), i * 110));
    }
  };
}
