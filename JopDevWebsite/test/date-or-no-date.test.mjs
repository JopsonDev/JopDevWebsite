import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DATES,
  ROUND_CASE_COUNTS,
  chooseBankerOffer,
  createGameCases,
  getRoundCaseCount,
  shuffle,
} from '../js/date-or-no-date.mjs';

test('the default game includes 22 complete, editable date ideas', () => {
  assert.equal(DEFAULT_DATES.length, 22);
  assert.ok(DEFAULT_DATES.every((idea) => idea.title && idea.description && idea.budget));
});

test('a game randomly selects 16 numbered cases without changing the idea bank', () => {
  const originalTitles = DEFAULT_DATES.map((idea) => idea.title);
  const cases = createGameCases(DEFAULT_DATES, () => 0.5);

  assert.equal(cases.length, 16);
  assert.deepEqual(cases.map((gameCase) => gameCase.number), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.equal(new Set(cases.map((gameCase) => gameCase.idea.title)).size, 16);
  assert.deepEqual(DEFAULT_DATES.map((idea) => idea.title), originalTitles);
});

test('six rounds leave two sealed cases for the final decision', () => {
  assert.equal(ROUND_CASE_COUNTS.length, 6);
  assert.equal(ROUND_CASE_COUNTS.reduce((total, count) => total + count, 0), 14);
  assert.equal(getRoundCaseCount(0), 4);
  assert.equal(getRoundCaseCount(5), 1);
  assert.equal(getRoundCaseCount(6), 0);
});

test('the Banker never offers the player case or an opened case', () => {
  const cases = createGameCases(DEFAULT_DATES, () => 0.25);
  cases[1].opened = true;
  const playerCaseNumber = 1;

  const offer = chooseBankerOffer(cases, playerCaseNumber, () => 0);

  assert.equal(offer.title, cases[2].idea.title);
  assert.notEqual(offer.title, cases[0].idea.title);
  assert.notEqual(offer.title, cases[1].idea.title);
});

test('shuffle returns a new array without mutating its input', () => {
  const input = [1, 2, 3, 4];
  const output = shuffle(input, () => 0);

  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.notEqual(output, input);
  assert.deepEqual([...output].sort(), input);
});
