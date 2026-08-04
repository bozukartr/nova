import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isValidCode, randomCode, newRoom, sideOf, starterFor, turnOf,
  isMyTurn, canSubmit, opponentIdleFor, toValue, toFields, fromValue, fromFields
} from '../src/room.js';
import { createBoard, applyMove, winnerOf, isLegal } from '../src/engine.js';

const base = () => newRoom({ code: '4242', host: 'H', board: 'm', series: 3, now: 1000 });

test('oda kodu daima dört hanelidir', () => {
  for (const r of [0, 0.0001, 0.5, 0.999999]) {
    const code = randomCode(() => r);
    assert.match(code, /^[0-9]{4}$/, code);
    assert.ok(+code >= 1000 && +code <= 9999);
  }
  assert.equal(isValidCode('0042'), true, 'girişte her dört hane kabul edilir');
  assert.equal(isValidCode('4242'), true);
  assert.equal(isValidCode('42'), false);
  assert.equal(isValidCode('42a2'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(null), false);
});

test('taraflar: kurucu MAGMA, katılan AURORA', () => {
  const room = base();
  assert.equal(sideOf(room, 'H'), 1);
  assert.equal(sideOf(room, 'G'), 0, 'henüz katılmadı');
  room.guest = 'G';
  assert.equal(sideOf(room, 'G'), 2);
  assert.equal(sideOf(room, 'X'), 0);
  assert.equal(sideOf(room, null), 0);
});

test('turlar sırayla el değiştirir, sıra hamle sayısından türer', () => {
  const room = base();
  room.guest = 'G';
  room.status = 'playing';
  assert.equal(starterFor(1), 1);
  assert.equal(starterFor(2), 2);
  assert.equal(turnOf(room), 1);
  room.moves = [5];
  assert.equal(turnOf(room), 2);
  room.moves = [5, 6];
  assert.equal(turnOf(room), 1);
  room.round = 2;
  room.moves = [];
  assert.equal(turnOf(room), 2, '2. turu AURORA açar');
  room.moves = [5];
  assert.equal(turnOf(room), 1);
});

test('sıra bende değilken hamle gönderilemez', () => {
  const room = base();
  room.guest = 'G';
  room.status = 'playing';
  assert.equal(isMyTurn(room, 'H'), true);
  assert.equal(isMyTurn(room, 'G'), false);
  assert.equal(isMyTurn(room, 'X'), false);
  assert.equal(canSubmit(room, 'H', 0), true);
  assert.equal(canSubmit(room, 'H', 1), false, 'elimdeki liste sunucudan geride');
  assert.equal(canSubmit(room, 'G', 0), false);
});

test('rakip beklenirken hiç kimse oynayamaz', () => {
  const room = base();                 // status: waiting
  assert.equal(isMyTurn(room, 'H'), false);
  room.guest = 'G';
  room.status = 'playing';
  assert.equal(isMyTurn(room, 'H'), true);
  room.status = 'ended';
  assert.equal(isMyTurn(room, 'H'), false);
});

test('rakibin sessizlik süresi karşı tarafın işaretinden okunur', () => {
  const room = base();
  room.guest = 'G';
  room.hostSeen = 1000;
  room.guestSeen = 5000;
  assert.equal(opponentIdleFor(room, 'H', 9000), 4000);
  assert.equal(opponentIdleFor(room, 'G', 9000), 8000);
  assert.equal(opponentIdleFor(room, 'X', 9000), Infinity);
  room.guestSeen = 0;
  assert.equal(opponentIdleFor(room, 'H', 9000), Infinity, 'hiç görülmedi');
});

test('hamle listesi iki istemcide aynı tahtayı üretir', () => {
  const moves = [12, 7, 12, 8, 13, 7];
  const build = () => {
    const b = createBoard(6, 5);
    let side = starterFor(1);
    for (const m of moves) {
      assert.equal(isLegal(b, side, m), true, 'kayıttaki hamle yasal olmalı');
      applyMove(b, side, m);
      side = 3 - side;
    }
    return b;
  };
  const a = build(), c = build();
  assert.deepEqual(Array.from(a.n), Array.from(c.n));
  assert.deepEqual(Array.from(a.o), Array.from(c.o));
  assert.equal(winnerOf(a), winnerOf(c));
});

test('Firestore değerleri gidip geri dönünce aynı kalır', () => {
  const room = newRoom({ code: '1234', host: 'H', board: 'l', series: 5, now: 1700000000000 });
  room.guest = 'G';
  room.moves = [0, 1, 2, 29];
  const roundTrip = fromFields(toFields(room));
  assert.deepEqual(roundTrip, room);
});

test('değer kodlaması tipleri korur', () => {
  assert.deepEqual(toValue(null), { nullValue: null });
  assert.deepEqual(toValue(3), { integerValue: '3' });
  assert.deepEqual(toValue(1.5), { doubleValue: 1.5 });
  assert.deepEqual(toValue('a'), { stringValue: 'a' });
  assert.deepEqual(toValue(true), { booleanValue: true });
  assert.deepEqual(toValue([]), { arrayValue: {} });
  assert.deepEqual(toValue([1]), { arrayValue: { values: [{ integerValue: '1' }] } });
  assert.equal(fromValue({ arrayValue: {} }).length, 0, 'boş dizi boş dönmeli');
  assert.equal(fromValue({ integerValue: '42' }), 42);
  assert.equal(fromValue({ timestampValue: '2024-01-01T00:00:00Z' }), Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(fromValue(undefined), null);
});
