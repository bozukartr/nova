#!/usr/bin/env node
/* NOVA · canlı oda denetimi
 *
 * Gerçek Firebase projesine bağlanıp iki oyuncu simüle eder: anonim giriş,
 * oda kurma, katılma, hamle alışverişi, çakışma reddi, tur ilerletme, rövanş
 * ve odayı kapatma. Bittiğinde açtığı odayı siler.
 *
 *   node tools/net-check.mjs
 *
 * Ağ gerektirdiği için `npm test` içinde değil; CI'da çalışmaz.
 */

import { createNet } from '../src/net.js';
import { sideOf, turnOf } from '../src/room.js';

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
  if (!cond) failures++;
};
const memStore = () => { let v = null; return { get: () => v, set: x => { v = x; } }; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const host = createNet({ store: memStore() });
const guest = createNet({ store: memStore() });
let code = null;

try {
  console.log('\n· kimlik');
  const a = await host.signIn();
  const b = await guest.signIn();
  ok(!!a.uid && !!b.uid, `iki anonim oturum açıldı (${a.uid.slice(0, 6)}…, ${b.uid.slice(0, 6)}…)`);
  ok(a.uid !== b.uid, 'oturumlar birbirinden bağımsız');

  console.log('\n· oda kurma');
  const created = await host.createRoom({ board: 'm', series: 3 });
  code = created.code;
  ok(/^[0-9]{4}$/.test(code), `dört haneli kod üretildi: ${code}`);
  ok(created.status === 'waiting' && created.guest === null, 'oda rakip bekliyor');
  ok(sideOf(created, host.uid) === 1, 'kurucu MAGMA');

  console.log('\n· katılma');
  const joined = await guest.joinRoom(code);
  ok(joined.status === 'playing', 'oda oyuna geçti');
  ok(sideOf(joined, guest.uid) === 2, 'katılan AURORA');
  ok(host.myTurn() === false, 'kurucu henüz odayı tazelemedi');

  console.log('\n· hamle alışverişi');
  await wait(1200);                                  // kurucunun yoklaması
  ok(host.room.guest === guest.uid, 'kurucu rakibi gördü');
  ok(host.myTurn() === true, 'ilk turu MAGMA açar');
  ok(guest.myTurn() === false, 'sıra AURORA’da değil');

  await host.submitMove(12, 0);
  ok(host.room.moves.length === 1, 'hamle listeye eklendi');
  await wait(1200);
  ok(guest.room.moves.join() === '12', 'rakip hamleyi gördü');
  ok(guest.myTurn() === true, 'sıra AURORA’ya geçti');
  ok(turnOf(guest.room) === 2, 'sıra hamle sayısından doğru türetildi');

  await guest.submitMove(7, 1);
  await wait(1200);
  ok(host.room.moves.join() === '12,7', 'karşılıklı hamleler sırayla dizildi');

  console.log('\n· eşzamanlılık koruması');
  let stale = false;
  try { await host.submitMove(3, 0); } catch (e) { stale = e.code === 'stale'; }
  ok(stale, 'eski sayaçla gönderilen hamle reddedildi');
  ok(host.room.moves.join() === '12,7', 'reddedilen hamle listeye yazılmadı');

  let full = false;
  const third = createNet({ store: memStore() });
  try { await third.joinRoom(code); } catch (e) { full = e.code === 'full'; }
  ok(full, 'üçüncü oyuncu dolu odaya alınmadı');
  third.dispose();

  console.log('\n· tur ve rövanş');
  await host.nextRound(1, { 1: 1, 2: 0 });
  ok(host.room.round === 2 && host.room.moves.length === 0, 'tur ilerledi, tahta temizlendi');
  ok(host.room.wins1 === 1, 'seri skoru yazıldı');
  await guest.nextRound(1, { 1: 1, 2: 0 });
  ok(host.room.round === 2, 'ikinci ilerletme isteği turu iki kez atlatmadı');

  await host.rematch(1);
  ok(host.room.gen === 2 && host.room.round === 1 && host.room.wins1 === 0, 'rövanş maçı sıfırladı');

  console.log('\n· ayrılma');
  await guest.leave();
  const probe = createNet({ store: memStore() });
  await probe.signIn();
  let ended = null;
  try { await probe.joinRoom(code); } catch (e) { ended = e.code; }
  ok(ended === 'gone', 'ayrılan oyuncudan sonra oda kapalı işaretlendi');

  await host.leave();                                 // kurucu odayı siler
  let missing = null;
  try { await probe.joinRoom(code); } catch (e) { missing = e.code; }
  ok(missing === 'not-found', 'kurucu ayrılınca oda tamamen silindi');
  probe.dispose();
} catch (e) {
  console.error('\nbeklenmeyen hata:', e.code || '', e.message);
  failures++;
} finally {
  host.dispose();
  guest.dispose();
}

console.log(failures ? `\n${failures} denetim başarısız\n` : '\ntüm denetimler geçti\n');
process.exit(failures ? 1 : 0);
