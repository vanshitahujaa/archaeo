/**
 * Cosmetic vs behavioral classifier tests — #20 / Part D.1.
 *
 * A thorough hand-labeled table plus precision/recall measurement, per the spec: the
 * classifier "gets its own test suite against hand-labeled examples, measured by precision
 * and recall."
 */

import { describe, expect, it } from 'vitest';
import { classifyChange, tokenize } from '../../src/provenance/classifier.js';

interface Case {
  name: string;
  added: string[];
  removed: string[];
  pathChanged?: boolean;
  expectCosmetic: boolean;
}

const CASES: Case[] = [
  // ---- cosmetic ----
  {
    name: 'whitespace/indentation only',
    removed: ['if(x<=0)return false;'],
    added: ['  if (x <= 0) return false;'],
    expectCosmetic: true,
  },
  {
    name: 'reformat whole function body (tokens identical)',
    removed: [
      'export function f(a:number,b:string):boolean{',
      'if(a<=0)return false;',
      'return true;',
      '}',
    ],
    added: [
      'export function f(a: number, b: string): boolean {',
      '  if (a <= 0) return false;',
      '  return true;',
      '}',
    ],
    expectCosmetic: true,
  },
  {
    name: 'pure identifier rename (count -> retries)',
    removed: ['for (let i = 0; i < count; i++) {'],
    added: ['for (let i = 0; i < retries; i++) {'],
    expectCosmetic: true,
  },
  {
    name: 'comment-only addition',
    removed: [],
    added: ['// retry up to N times before failing'],
    expectCosmetic: true,
  },
  {
    name: 'comment-only change with code preserved',
    removed: ['return doThing(); // old note'],
    added: ['return doThing(); // new note explaining why'],
    expectCosmetic: true,
  },
  {
    name: 'move with no content change (path changed, no add/remove)',
    removed: [],
    added: [],
    pathChanged: true,
    expectCosmetic: true,
  },
  {
    name: 'jsdoc continuation comment',
    removed: [],
    added: [' * @param token the bearer token'],
    expectCosmetic: true,
  },

  // ---- behavioral ----
  {
    name: 'changed a numeric literal (3 -> 5)',
    removed: ['retry(fn, 3);'],
    added: ['retry(fn, 5);'],
    expectCosmetic: false,
  },
  {
    name: 'added a guard condition',
    removed: [],
    added: ['if (!idempotencyKey) throw new Error("required");'],
    expectCosmetic: false,
  },
  {
    name: 'changed an operator (<= -> <)',
    removed: ['if (amount <= 0) return false;'],
    added: ['if (amount < 0) return false;'],
    expectCosmetic: false,
  },
  {
    name: 'changed a call (different function)',
    removed: ['return fetchUser(id);'],
    added: ['return fetchUserCached(id);'],
    expectCosmetic: false,
  },
  {
    name: 'removed logic (deletion)',
    removed: ['validate(input);'],
    added: [],
    expectCosmetic: false,
  },
  {
    name: 'changed a string literal',
    removed: ['throw new Error("max retries");'],
    added: ['throw new Error("max retries exceeded");'],
    expectCosmetic: false,
  },
  {
    name: 'identifier rename PLUS a literal change is behavioral',
    removed: ['for (let i = 0; i < count; i++) {'],
    added: ['for (let i = 0; i < retries + 1; i++) {'],
    expectCosmetic: false,
  },
  {
    name: 'new function introduction',
    removed: [],
    added: ['export function processPayment(amount: number): boolean {'],
    expectCosmetic: false,
  },
];

describe('classifyChange (D.1)', () => {
  for (const c of CASES) {
    it(`${c.expectCosmetic ? 'cosmetic' : 'behavioral'}: ${c.name}`, () => {
      const out = classifyChange({ added: c.added, removed: c.removed, pathChanged: c.pathChanged });
      expect(out.isCosmetic, `${c.name} → ${out.reason}`).toBe(c.expectCosmetic);
      expect(out.reason.length).toBeGreaterThan(0);
    });
  }

  it('achieves perfect precision/recall on the hand-labeled set', () => {
    // Treat "cosmetic" as the positive class.
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const c of CASES) {
      const predicted = classifyChange({
        added: c.added,
        removed: c.removed,
        pathChanged: c.pathChanged,
      }).isCosmetic;
      if (predicted && c.expectCosmetic) tp += 1;
      else if (predicted && !c.expectCosmetic) fp += 1;
      else if (!predicted && c.expectCosmetic) fn += 1;
      else tn += 1;
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    // The spec demands a high bar; our labeled table is clean enough to expect 1.0.
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(recall).toBeGreaterThanOrEqual(0.9);
    expect(tn).toBeGreaterThan(0); // we actually classified some behavioral ones correctly
  });
});

describe('tokenize', () => {
  it('drops whitespace, keeps identifiers/literals/operators', () => {
    expect(tokenize('  if (x<=0) return false;')).toEqual([
      'if',
      '(',
      'x',
      '<',
      '=',
      '0',
      ')',
      'return',
      'false',
      ';',
    ]);
  });
  it('keeps string literals intact', () => {
    expect(tokenize('throw new Error("a b c")')).toEqual([
      'throw',
      'new',
      'Error',
      '(',
      '"a b c"',
      ')',
    ]);
  });
});
