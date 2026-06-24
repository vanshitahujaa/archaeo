/**
 * Pre-ship improvements (Maestro): #43 closing-keyword issue refs + silent Octokit,
 * #47 partial/shallow-clone warning.
 */

import { describe, expect, it } from 'vitest';
import { referencedIssueNumbers } from '../../src/integration/hosts/github.js';
import { cloneHealthWarning } from '../../src/integration/git/gitClient.js';

describe('#43 referencedIssueNumbers — closing keywords only', () => {
  it('matches closing keywords (closes/fixes/resolves, all tenses)', () => {
    expect(referencedIssueNumbers('Fixes #102')).toEqual([102]);
    expect(referencedIssueNumbers('this closes #5 and resolved #6')).toEqual([5, 6]);
    expect(referencedIssueNumbers('closed #7\nfix #8')).toEqual([7, 8]);
  });

  it('ignores bare mentions and PR-number noise', () => {
    expect(referencedIssueNumbers('see #999, related to #123 (#3319)')).toEqual([]);
    expect(referencedIssueNumbers('Refactor SchedulerHostConfigs (#20025)')).toEqual([]);
  });

  it('dedupes', () => {
    expect(referencedIssueNumbers('fixes #1 and also fixes #1')).toEqual([1]);
  });
});

describe('#47 cloneHealthWarning', () => {
  it('warns on a shallow clone', () => {
    const w = cloneHealthWarning({ partial: false, shallow: true });
    expect(w).toContain('shallow');
  });
  it('warns on a partial (blobless) clone', () => {
    const w = cloneHealthWarning({ partial: true, shallow: false });
    expect(w).toContain('partial');
  });
  it('says nothing for a full clone', () => {
    expect(cloneHealthWarning({ partial: false, shallow: false })).toBeNull();
  });
});
