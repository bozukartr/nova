import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, indexOf, place, applyMove, winnerOf, isLegal, cloneBoard } from '../src/engine.js';
import { pickMove, evaluate } from '../src/ai.js';

const at = (b, r, c) => indexOf(b, r, c);
const steady = () => 0;            // gürültüsüz rng: "kasıtlı hata" dalını kapatır
const clock = () => Date.now();

test('AI her zaman yasal hamle döndürür', () => {
  const b = createBoard(6, 5);
  place(b, 1, at(b, 0, 0));
  place(b, 2, at(b, 5, 4));
  place(b, 1, at(b, 2, 2));
  for (const level of [0, 1, 2]) {
    const i = pickMove(b, 2, level, { rng: steady, now: clock });
    assert.ok(i >= 0, 'hamle bulunmalı');
    assert.equal(isLegal(b, 2, i), true, `seviye ${level} yasadışı hamle verdi`);
  }
});

test('AI aramayı yaparken gerçek tahtaya dokunmaz', () => {
  const b = createBoard(6, 5);
  place(b, 1, at(b, 1, 1));
  place(b, 2, at(b, 3, 3));
  const before = JSON.stringify([Array.from(b.n), Array.from(b.o), b.played]);
  pickMove(b, 2, 2, { rng: steady, now: clock });
  assert.equal(JSON.stringify([Array.from(b.n), Array.from(b.o), b.played]), before);
});

test('kazanan hamle varsa ZOR seviye onu bulur', () => {
  const b = createBoard(6, 5);
  // AURORA köşede patlamaya bir kala; MAGMA'nın tek çekirdeği tam yanında.
  b.n[at(b, 0, 0)] = 1; b.o[at(b, 0, 0)] = 2;
  b.n[at(b, 0, 1)] = 1; b.o[at(b, 0, 1)] = 1;
  b.played[1] = b.played[2] = true;

  const move = pickMove(b, 2, 2, { rng: steady, now: clock });
  assert.equal(move, at(b, 0, 0));

  const after = cloneBoard(b);
  applyMove(after, 2, move);
  assert.equal(winnerOf(after), 2);
});

test('AI yığınını patlamaya hazır düşmanın dibinde büyütmez', () => {
  const b = createBoard(6, 5);
  // AURORA orta hücrede iki çekirdek tutuyor (kapasite 4).
  const stack = at(b, 2, 1);
  b.n[stack] = 2; b.o[stack] = 2;
  // Bitişikteki MAGMA kenar hücresi patlamaya bir kala: sıra ona geçerse yutar.
  const threat = at(b, 2, 0);
  b.n[threat] = 2; b.o[threat] = 1;
  b.played[1] = b.played[2] = true;
  assert.equal(b.caps[stack], 4);
  assert.equal(b.caps[threat], 3, 'tehdit hücresi kenarda, tek çekirdek eksiği var');

  const move = pickMove(b, 2, 2, { rng: steady, now: clock });
  assert.notEqual(move, stack, 'yığını büyütmek onu rakibe hediye eder');
});

test('değerlendirme köşeyi ortaya tercih eder', () => {
  const corner = createBoard(6, 5);
  corner.n[at(corner, 0, 0)] = 1; corner.o[at(corner, 0, 0)] = 2;
  const center = createBoard(6, 5);
  center.n[at(center, 2, 2)] = 1; center.o[at(center, 2, 2)] = 2;
  assert.ok(evaluate(corner, 2) > evaluate(center, 2));
});

test('boş tahtada açılış eleme sayılmaz', () => {
  const b = createBoard(6, 5);
  place(b, 2, at(b, 0, 0));
  assert.ok(Math.abs(evaluate(b, 2)) < 1e5, 'rakip henüz oynamadı, kazanç yok');
});

test('zaman bütçesi aşılsa da hamle döner', () => {
  const b = createBoard(8, 6);
  place(b, 1, at(b, 0, 0));
  place(b, 2, at(b, 7, 5));
  const move = pickMove(b, 2, 2, { rng: steady, now: clock, budget: 0 });
  assert.ok(move >= 0 && isLegal(b, 2, move));
});

test('ZOR seviye KOLAY seviyeye karşı seriyi alır', () => {
  let wins = { 1: 0, 2: 0 };
  for (let game = 0; game < 6; game++) {
    const b = createBoard(6, 5);
    let side = game % 2 === 0 ? 1 : 2;   // sırayla başlama hakkı
    let rng = mulberry(game + 1);
    for (let turn = 0; turn < 200; turn++) {
      const level = side === 1 ? 0 : 2;
      const move = pickMove(b, side, level, { rng, now: clock });
      if (move < 0) break;
      applyMove(b, side, move);
      const w = winnerOf(b);
      if (w) { wins[w]++; break; }
      side = 3 - side;
    }
  }
  assert.ok(wins[2] > wins[1], `ZOR ${wins[2]} — KOLAY ${wins[1]}`);
});

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
