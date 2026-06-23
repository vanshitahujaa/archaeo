/**
 * Behavioral evidence tests — #25 / Part D.6.
 * Co-changed paths + structural hints from the introducing diff. No LLM.
 */

import { describe, expect, it } from 'vitest';
import { extractBehavioralEvidence } from '../../src/provenance/behavioral.js';
import type { CommitDiff } from '../../src/core/index.js';

describe('extractBehavioralEvidence (D.6)', () => {
  it('collects co-changed paths and excludes the target path', () => {
    const diff: CommitDiff = {
      sha: 'abc',
      files: [
        { path: 'auth.ts', added: [], removed: [] },
        { path: 'session-store.ts', added: [], removed: [] },
        { path: 'login.controller.ts', added: [], removed: [] },
      ],
    };
    const ev = extractBehavioralEvidence(diff, 'auth.ts');
    expect(ev.introducingSha).toBe('abc');
    expect(ev.coChangedPaths).toEqual(['session-store.ts', 'login.controller.ts']);
  });

  it('derives "added retry logic" hint', () => {
    const diff: CommitDiff = {
      sha: 'r1',
      files: [{ path: 'svc.ts', added: ['for (i=0;i<retries;i++) { /* retry */ }'], removed: [] }],
    };
    expect(extractBehavioralEvidence(diff).summaryHints).toContain('added retry logic');
  });

  it('derives "added idempotency handling" hint', () => {
    const diff: CommitDiff = {
      sha: 'i1',
      files: [{ path: 'pay.ts', added: ['if (!idempotencyKey) throw new Error("x");'], removed: [] }],
    };
    const hints = extractBehavioralEvidence(diff).summaryHints;
    expect(hints).toContain('added idempotency handling');
  });

  it('derives "added input validation" hint', () => {
    const diff: CommitDiff = {
      sha: 'v1',
      files: [{ path: 'pay.ts', added: ['if (amount <= 0) return false;'], removed: [] }],
    };
    expect(extractBehavioralEvidence(diff).summaryHints).toContain('added input validation');
  });

  it('returns no hints when nothing matches', () => {
    const diff: CommitDiff = {
      sha: 'n1',
      files: [{ path: 'x.ts', added: ['const z = 1;'], removed: [] }],
    };
    const ev = extractBehavioralEvidence(diff);
    expect(ev.coChangedPaths).toEqual(['x.ts']);
    expect(ev.summaryHints).toEqual([]);
  });
});
