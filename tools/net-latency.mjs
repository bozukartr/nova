#!/usr/bin/env node
/* NOVA · hamle gecikmesi ölçümü
 *
 * Bir hamlenin karşı ekranda görünmesi ne kadar sürüyor? Gerçek projeye iki
 * oyuncu bağlayıp ölçer:
 *   t0 = gönderen yazma isteğini başlatır
 *   t1 = alıcının oda dinleyicisi hamleyi görür
 *
 *   node tools/net-latency.mjs [hamle sayısı]
 *
 * Bu makinenin ağı ne kadar iyiyse sonuç o kadar iyi çıkar: telefonda araya
 * bir de mobil şebeke gecikmesi girer. Ölçüm bittiğinde açtığı odayı siler.
 */

import { createNet } from '../src/net.js';

const ROUNDS = Math.max(2, Number(process.argv[2] || 8));
const memStore = () => { let v = null; return { get: () => v, set: x => { v = x; } }; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const host = createNet({ store: memStore() });
const guest = createNet({ store: memStore() });

const listeners = { host: null, guest: null };
host.on(r => listeners.host && listeners.host(r), () => {});
guest.on(r => listeners.guest && listeners.guest(r), () => {});

/** Alıcının hamleyi gördüğü anı yakala. */
const seesMove = (who, count) => new Promise(resolve => {
  const client = who === 'host' ? host : guest;
  if (client.room && client.room.moves.length >= count) return resolve(performance.now());
  listeners[who] = r => {
    if (r.moves.length >= count) { listeners[who] = null; resolve(performance.now()); }
  };
});

const samples = [];
const cells = [12, 7, 13, 8, 14, 9, 16, 11, 17, 6, 18, 3, 19, 2, 21, 1];

try {
  await host.signIn();
  await guest.signIn();
  const room = await host.createRoom({ board: 'm', series: 3 });
  await guest.joinRoom(room.code);
  await wait(1500);                         // kurucu rakibi görsün
  console.log(`\noda ${room.code} · ${ROUNDS} hamle ölçülüyor\n`);

  for (let i = 0; i < ROUNDS; i++) {
    const sender = i % 2 === 0 ? host : guest;
    const receiver = i % 2 === 0 ? 'guest' : 'host';
    const arrival = seesMove(receiver, i + 1);
    const t0 = performance.now();
    await sender.submitMove(cells[i % cells.length], i);
    const ms = (await arrival) - t0;
    samples.push(ms);
    console.log(`  ${String(i + 1).padStart(2)}. hamle  ${String(Math.round(ms)).padStart(5)} ms`);
    await wait(400);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  console.log(
    `\n  ortalama ${Math.round(avg)} ms · ortanca ${Math.round(median)} ms` +
    ` · en iyi ${Math.round(sorted[0])} ms · en kötü ${Math.round(sorted[sorted.length - 1])} ms\n`
  );
  await host.leave();
} catch (e) {
  console.error('ölçüm başarısız:', e.code || '', e.message);
  process.exitCode = 1;
} finally {
  host.dispose();
  guest.dispose();
}
