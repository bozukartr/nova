import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBoard, cloneBoard, snapshot, restore, indexOf,
  isLegal, legalMoves, criticalCells, detonate, scatter,
  hasRival, place, resolve, applyMove, counts, winnerOf
} from '../src/engine.js';

const at = (b, r, c) => indexOf(b, r, c);

test('kapasiteler: köşe 2, kenar 3, orta 4', () => {
  const b = createBoard(6, 5);
  assert.equal(b.caps[at(b, 0, 0)], 2);
  assert.equal(b.caps[at(b, 5, 4)], 2);
  assert.equal(b.caps[at(b, 0, 2)], 3);
  assert.equal(b.caps[at(b, 3, 0)], 3);
  assert.equal(b.caps[at(b, 3, 2)], 4);
});

test('rakip hücresine oynanamaz, kendi hücresine oynanır', () => {
  const b = createBoard(6, 5);
  const i = at(b, 2, 2);
  assert.equal(place(b, 1, i), true);
  assert.equal(isLegal(b, 2, i), false);
  assert.equal(place(b, 2, i), false);
  assert.equal(b.n[i], 1, 'geçersiz hamle tahtayı değiştirmemeli');
  assert.equal(b.o[i], 1);
  assert.equal(isLegal(b, 1, i), true);
});

test('boş tahtada her hücre iki taraf için de yasal', () => {
  const b = createBoard(5, 4);
  assert.equal(legalMoves(b, 1).length, 20);
  assert.equal(legalMoves(b, 2).length, 20);
  place(b, 1, at(b, 0, 0));
  assert.equal(legalMoves(b, 2).length, 19);
  assert.equal(legalMoves(b, 1).length, 20);
});

test('köşe hücresi ikinci çekirdekte patlar ve komşuları çevirir', () => {
  const b = createBoard(6, 5);
  const corner = at(b, 0, 0);
  place(b, 2, at(b, 0, 1));            // rakip komşu: zincirin durmaması için
  place(b, 1, corner);
  place(b, 1, corner);
  assert.equal(b.n[corner], 2);
  const steps = resolve(b, 1);
  assert.equal(steps, 1);
  assert.equal(b.n[corner], 0);
  assert.equal(b.o[corner], 0);
  assert.equal(b.o[at(b, 0, 1)], 1, 'komşu el değiştirmeli');
  assert.equal(b.n[at(b, 0, 1)], 2);
  assert.equal(b.n[at(b, 1, 0)], 1);
});

test('detonate/scatter ayrı ayrı da tutarlı (animasyon yolu)', () => {
  const b = createBoard(6, 5);
  const i = at(b, 0, 0);
  b.n[i] = 2; b.o[i] = 1;
  const buf = new Int32Array(b.size);
  const k = criticalCells(b, buf);
  assert.equal(k, 1);
  detonate(b, buf, k);
  assert.equal(b.n[i], 0);
  assert.equal(b.o[i], 0, 'boşalan hücre sahipsiz kalmalı');
  scatter(b, buf, k, 1);
  assert.equal(b.n[at(b, 0, 1)], 1);
  assert.equal(b.o[at(b, 0, 1)], 1);
});

test('zincir birden fazla adım sürer ve sonlanır', () => {
  const b = createBoard(6, 5);
  // Sol üst köşede dolu bir merdiven kur.
  b.n[at(b, 0, 0)] = 1; b.o[at(b, 0, 0)] = 1;
  b.n[at(b, 0, 1)] = 2; b.o[at(b, 0, 1)] = 1;
  b.n[at(b, 1, 0)] = 2; b.o[at(b, 1, 0)] = 1;
  b.n[at(b, 4, 4)] = 1; b.o[at(b, 4, 4)] = 2;   // rakip hayatta
  b.played[1] = b.played[2] = true;
  const steps = applyMove(b, 1, at(b, 0, 0));
  assert.ok(steps >= 2, `zincir en az 2 adım sürmeli, ${steps} sürdü`);
  assert.equal(winnerOf(b), 0);
});

test('tek renk kalınca zincir sonsuza gitmez', () => {
  const b = createBoard(5, 4);
  for (let i = 0; i < b.size; i++) { b.n[i] = b.caps[i]; b.o[i] = 1; }
  b.played[1] = b.played[2] = true;
  const steps = resolve(b, 1, { maxSteps: 64 });
  assert.ok(steps < 64, 'kritik tahta erken durmalı');
});

test('kazanan yalnız iki taraf da oynadıktan sonra belirlenir', () => {
  const b = createBoard(6, 5);
  place(b, 1, at(b, 2, 2));
  assert.equal(winnerOf(b), 0, 'rakip daha oynamadı');
  place(b, 2, at(b, 4, 3));
  assert.equal(winnerOf(b), 0);
  b.n[at(b, 4, 3)] = 0; b.o[at(b, 4, 3)] = 0;
  assert.equal(winnerOf(b), 1);
});

test('rakibin son çekirdeği yutulunca tur biter', () => {
  const b = createBoard(6, 5);
  const corner = at(b, 0, 0);
  b.n[corner] = 1; b.o[corner] = 1;
  b.n[at(b, 0, 1)] = 1; b.o[at(b, 0, 1)] = 2;
  b.played[1] = b.played[2] = true;
  applyMove(b, 1, corner);
  assert.equal(winnerOf(b), 1);
  assert.equal(counts(b)[1], 0);
});

test('kopya ve anlık görüntü orijinali bağımsız bırakır', () => {
  const b = createBoard(6, 5);
  place(b, 1, at(b, 1, 1));
  const snap = snapshot(b);
  const copy = cloneBoard(b);
  place(copy, 1, at(b, 1, 1));
  assert.equal(b.n[at(b, 1, 1)], 1, 'kopyaya oynamak orijinali değiştirmemeli');
  assert.equal(copy.n[at(b, 1, 1)], 2);
  place(b, 2, at(b, 3, 3));
  restore(b, snap);
  assert.equal(b.n[at(b, 3, 3)], 0);
  assert.equal(b.played[2], false);
});

test('hasRival yalnız karşı tarafın çekirdeğini sayar', () => {
  const b = createBoard(5, 4);
  place(b, 1, at(b, 0, 0));
  assert.equal(hasRival(b, 1), false);
  place(b, 2, at(b, 4, 3));
  assert.equal(hasRival(b, 1), true);
  assert.equal(hasRival(b, 2), true);
});
