/**
 * Hand-labeled "most-relevant comment" sets for the D.3 review-comment ranker
 * (issues #34 / #61, Part D.3: "a test where one substantive comment outranks 50 noise
 * comments").
 *
 * Each scenario is a realistic PR review thread: one comment a human picked as the single
 * MOST substantive (the one that actually explains why the code exists), buried among noise
 * (lgtm, nits, bot chatter). The accompanying test (test/benchmark/comments.bench.test.ts)
 * runs the MERGED engine's `rankComments` and asserts the labeled comment ranks first.
 *
 * Ownership: test/fixtures/ ONLY. Do NOT edit src/.
 */

export interface RawComment {
  author: string;
  body: string;
  /** File the comment is anchored to (undefined = not anchored). */
  path?: string;
  line?: number;
  submittedAt: string;
}

export interface CommentLabel {
  /** Short human-readable scenario name. */
  name: string;
  /** Paths touched by the introducing commit — used to detect anchored comments. */
  introducingPaths: string[];
  /** The review thread (substantive comment mixed into the noise). */
  comments: RawComment[];
  /** Author of the comment a human labeled as the single most substantive. */
  mostRelevantAuthor: string;
  /** Why a human picked it. */
  rationale: string;
}

const T = (n: number): string => `2024-07-0${n}T10:00:00Z`;

export const COMMENT_LABELS: CommentLabel[] = [
  {
    name: 'idempotency guard buried under lgtm/nits',
    introducingPaths: ['payments.ts'],
    comments: [
      { author: 'ci-bot', body: 'All checks passed ✅', submittedAt: T(1) },
      { author: 'dave', body: 'nit: trailing whitespace', path: 'payments.ts', line: 3, submittedAt: T(2) },
      { author: 'erin', body: 'lgtm', submittedAt: T(3) },
      {
        author: 'priya',
        body: 'This guard prevents the duplicate-charge race: without the idempotency key, two concurrent requests both pass the check and the customer is billed twice.',
        path: 'payments.ts',
        line: 2,
        submittedAt: T(4),
      },
      { author: 'frank', body: '+1', submittedAt: T(5) },
      { author: 'dependabot[bot]', body: 'bumping a dependency', submittedAt: T(6) },
    ],
    mostRelevantAuthor: 'priya',
    rationale:
      'Anchored to the introducing file, human author, causal language ("prevents", "race", "duplicate"), well above the length threshold.',
  },
  {
    name: 'deadlock explanation vs a long style nit',
    introducingPaths: ['scheduler.ts'],
    comments: [
      {
        author: 'reviewer',
        body: 'nit: please run prettier across this whole file before merging, the indentation is inconsistent in a few places and it makes the diff noisy',
        path: 'scheduler.ts',
        line: 11,
        submittedAt: T(1),
      },
      {
        author: 'sam',
        body: 'We take the locks in this fixed order specifically to avoid a deadlock — two workers grabbing them in opposite order would block each other forever.',
        path: 'scheduler.ts',
        line: 9,
        submittedAt: T(2),
      },
      { author: 'qa-bot', body: 'coverage unchanged', submittedAt: T(3) },
    ],
    mostRelevantAuthor: 'sam',
    rationale:
      'A long comment is not automatically substantive: the style nit is long but canned-flavored; the deadlock comment carries the real causal reason.',
  },
  {
    name: 'regression rationale among bot noise',
    introducingPaths: ['cache.ts'],
    comments: [
      { author: 'build-bot', body: 'Build succeeded', submittedAt: T(1) },
      { author: 'coverage-bot', body: '92% (+0.1%)', submittedAt: T(2) },
      {
        author: 'lin',
        body: 'Keeping the stale entry here is intentional: evicting it eagerly caused a regression where the next read stampeded the database under load.',
        path: 'cache.ts',
        line: 18,
        submittedAt: T(3),
      },
      { author: 'misc-bot', body: 'auto-label: area:storage', submittedAt: T(4) },
      { author: 'tom', body: 'ship it', submittedAt: T(5) },
    ],
    mostRelevantAuthor: 'lin',
    rationale:
      'Only the human, anchored comment explains the decision ("intentional", "regression", "stampeded"); everything else is bot or canned.',
  },
];
