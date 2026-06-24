/**
 * Hand-labeled commit-diff examples for the D.1 cosmetic-vs-behavioral classifier
 * (issues #34 / #61, Part H.2: "the classifier gets its own precision/recall against
 * hand-labeled commits").
 *
 * Each example is a small diff hunk (added/removed lines in the region of interest) with a
 * human-assigned ground-truth label. The accompanying test (test/benchmark/classifier.bench.test.ts)
 * runs the MERGED engine's `classifyChange` against this set and asserts precision/recall ≥ 0.9.
 *
 * "cosmetic" is the POSITIVE class throughout (it is the harder, higher-stakes call: a false
 * "cosmetic" hides a real behavioral introduction; a false "behavioral" merely adds noise).
 *
 * Ownership: test/fixtures/ ONLY. Do NOT edit src/. These labels are deliberately separate from
 * the classifier's own unit fixtures so the engine cannot be tuned to its own answer key.
 */

export interface ClassifierLabel {
  /** Short human-readable name for the case. */
  name: string;
  /** Lines added by the commit in the region of interest. */
  added: string[];
  /** Lines removed by the commit in the region of interest. */
  removed: string[];
  /** True if the file was renamed/moved (path changed) in this commit. */
  pathChanged?: boolean;
  /** Ground truth: is this change cosmetic? (cosmetic = positive class) */
  isCosmetic: boolean;
  /** Why a human labeled it this way. */
  rationale: string;
}

export const CLASSIFIER_LABELS: ClassifierLabel[] = [
  // ---------------------------------------------------------------------------
  // COSMETIC (positive class)
  // ---------------------------------------------------------------------------
  {
    name: 'reindent a block',
    removed: ['if(ready){doWork();}'],
    added: ['if (ready) {', '  doWork();', '}'],
    isCosmetic: true,
    rationale: 'Same tokens, only whitespace and brace placement changed.',
  },
  {
    name: 'spacing around operators',
    removed: ['const total=price*qty+tax;'],
    added: ['const total = price * qty + tax;'],
    isCosmetic: true,
    rationale: 'Identical token stream; pure formatting.',
  },
  {
    name: 'rename local variable consistently',
    removed: ['const tmp = compute();', 'return tmp;'],
    added: ['const result = compute();', 'return result;'],
    isCosmetic: true,
    rationale: 'A consistent identifier rename with identical structure is cosmetic (D.1).',
  },
  {
    name: 'add a line comment only',
    removed: [],
    added: ['// guard against an empty queue'],
    isCosmetic: true,
    rationale: 'Comment-only addition changes no executable tokens.',
  },
  {
    name: 'update an inline comment, code unchanged',
    removed: ['flush(); // TODO: revisit'],
    added: ['flush(); // batched flush, see #318'],
    isCosmetic: true,
    rationale: 'Code tokens identical; only the trailing comment text moved.',
  },
  {
    name: 'jsdoc block continuation',
    removed: [],
    added: [' * @returns the resolved session, or null when expired'],
    isCosmetic: true,
    rationale: 'JSDoc continuation line is a comment.',
  },
  {
    name: 'pure move with no content change',
    removed: [],
    added: [],
    pathChanged: true,
    isCosmetic: true,
    rationale: 'File path changed but content is byte-identical — a move.',
  },
  {
    name: 'align assignment whitespace',
    removed: ['const a=1;', 'const bb=2;'],
    added: ['const a  = 1;', 'const bb = 2;'],
    isCosmetic: true,
    rationale: 'Only spacing changed to align the `=`; token streams are identical.',
  },

  // ---------------------------------------------------------------------------
  // BEHAVIORAL (negative class)
  // ---------------------------------------------------------------------------
  {
    name: 'change a numeric literal',
    removed: ['setTimeout(cb, 1000);'],
    added: ['setTimeout(cb, 5000);'],
    isCosmetic: false,
    rationale: 'A literal that affects runtime behavior changed.',
  },
  {
    name: 'flip a comparison operator',
    removed: ['if (n >= limit) reject();'],
    added: ['if (n > limit) reject();'],
    isCosmetic: false,
    rationale: 'Boundary condition changed.',
  },
  {
    name: 'add a guard clause',
    removed: [],
    added: ['if (user == null) throw new Error("no user");'],
    isCosmetic: false,
    rationale: 'New control flow introduced.',
  },
  {
    name: 'swap the called function',
    removed: ['return fetchUser(id);'],
    added: ['return fetchUserCached(id);'],
    isCosmetic: false,
    rationale: 'The call target changed — different behavior.',
  },
  {
    name: 'delete a validation call',
    removed: ['validate(payload);'],
    added: [],
    isCosmetic: false,
    rationale: 'Removing logic is behavioral.',
  },
  {
    name: 'change a string passed to an API',
    removed: ['client.connect("us-east-1");'],
    added: ['client.connect("eu-west-1");'],
    isCosmetic: false,
    rationale: 'A string literal that selects behavior changed.',
  },
  {
    name: 'add an argument to a call',
    removed: ['retry(fn);'],
    added: ['retry(fn, 3);'],
    isCosmetic: false,
    rationale: 'Call signature/behavior changed.',
  },
  {
    name: 'rename plus a literal tweak (not a pure rename)',
    removed: ['for (let i = 0; i < count; i++) {'],
    added: ['for (let i = 0; i < retries + 1; i++) {'],
    isCosmetic: false,
    rationale: 'A literal/expression changed alongside the rename, so it is behavioral.',
  },
  {
    name: 'introduce a new function',
    removed: [],
    added: [
      'export function dedupe<T>(xs: T[]): T[] {',
      '  return [...new Set(xs)];',
      '}',
    ],
    isCosmetic: false,
    rationale: 'New executable code introduced.',
  },
  {
    name: 'negate a condition',
    removed: ['if (enabled) start();'],
    added: ['if (!enabled) start();'],
    isCosmetic: false,
    rationale: 'A `!` operator inverts the control flow.',
  },
];
