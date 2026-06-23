/**
 * Cosmetic vs behavioral classifier — A2 (Tracer), issue #20 / Part D.1.
 *
 * The single highest-leverage piece of code in the repo (D.1). Deterministic, no LLM.
 * Decides whether a commit's change to the region of interest is COSMETIC (whitespace,
 * formatting, comment, pure rename, content-preserving move) or BEHAVIORAL (touches
 * tokens that affect control flow, conditions, calls, or literals).
 *
 * Rules (Part D.1), checked in order:
 *  - Whitespace-only / formatting-only (compare tokens ignoring whitespace) → cosmetic.
 *  - Comment-only change → cosmetic.
 *  - Pure identifier rename with identical structure → cosmetic.
 *  - Move with no content change (path changed, content equal) → cosmetic.
 *  - Anything else that changes meaningful tokens → behavioral.
 */

export interface ClassificationInput {
  /** Lines added by the commit in the region of interest. */
  added: string[];
  /** Lines removed by the commit in the region of interest. */
  removed: string[];
  /** True if the file was renamed/moved (path changed) in this commit. */
  pathChanged?: boolean;
}

export interface Classification {
  isCosmetic: boolean;
  reason: string;
}

/**
 * Tokenize a source line into meaningful tokens, discarding all whitespace.
 * Identifiers/keywords/numbers are single tokens; punctuation/operators are single chars.
 * This lets us compare two lines for *structural* (token-level) equality while ignoring
 * indentation and spacing.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[^\s\w]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

/** Strip a trailing/standalone line comment and surrounding whitespace for comparison. */
function stripComment(line: string): string {
  // Remove // ... and /* ... */ (single-line) and standalone * (jsdoc continuation).
  return line
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '')
    .trim();
}

/** True when every token, ignoring whitespace, is identical between the two token lists. */
function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Is a token a comment-only fragment (line is entirely a comment)? */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/');
}

/**
 * Identifier-only difference: the two token streams are identical in shape (same length,
 * same non-identifier tokens in the same positions) and differ ONLY in identifier names.
 * That is a pure rename — cosmetic. If literals, operators, or call structure differ, it's
 * behavioral.
 */
function identifierOnlyDiff(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const isIdent = (t: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t);
  // A consistent rename applies the SAME old→new mapping everywhere. Inconsistent
  // substitutions, or changing a *callee* (identifier immediately followed by `(`), are
  // semantic changes, not renames.
  const mapping = new Map<string, string>();
  let renamed = false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x === y) continue;
    if (!isIdent(x) || !isIdent(y)) return false; // literal/operator changed → behavioral
    // Changing a call target (next token is "(") is behavioral, not a rename.
    const next = a[i + 1];
    if (next === '(') return false;
    // The substitution must be consistent across the hunk.
    const prior = mapping.get(x);
    if (prior !== undefined && prior !== y) return false;
    mapping.set(x, y);
    renamed = true;
  }
  return renamed;
}

export function classifyChange(input: ClassificationInput): Classification {
  const added = input.added ?? [];
  const removed = input.removed ?? [];

  const nonBlankAdded = added.filter((l) => l.trim().length > 0);
  const nonBlankRemoved = removed.filter((l) => l.trim().length > 0);

  // Move with no content change: path changed and there is no meaningful add/remove,
  // OR the added set token-equals the removed set.
  if (input.pathChanged) {
    if (nonBlankAdded.length === 0 && nonBlankRemoved.length === 0) {
      return { isCosmetic: true, reason: 'move/rename with no content change' };
    }
  }

  // Pure addition (no removals) of behavioral lines → behavioral introduction.
  // Pure addition of comment/blank lines → cosmetic.
  if (nonBlankRemoved.length === 0 && nonBlankAdded.length > 0) {
    if (nonBlankAdded.every(isCommentLine)) {
      return { isCosmetic: true, reason: 'comment-only addition' };
    }
    return { isCosmetic: false, reason: 'introduces new code' };
  }

  // Pure deletion → treat as behavioral (logic removed) unless it's comments only.
  if (nonBlankAdded.length === 0 && nonBlankRemoved.length > 0) {
    if (nonBlankRemoved.every(isCommentLine)) {
      return { isCosmetic: true, reason: 'comment-only deletion' };
    }
    return { isCosmetic: false, reason: 'removes code' };
  }

  // Both sides present: compare token streams ignoring whitespace.
  // 1) Whitespace/formatting only: the multiset of code tokens is unchanged.
  const addedTokens = nonBlankAdded.flatMap((l) => tokenize(stripComment(l)));
  const removedTokens = nonBlankRemoved.flatMap((l) => tokenize(stripComment(l)));
  if (sameTokens(addedTokens, removedTokens) && addedTokens.length > 0) {
    return { isCosmetic: true, reason: 'whitespace/formatting only (tokens unchanged)' };
  }

  // 2) Comment-only change: code tokens (sans comments) are identical, only comments moved.
  const addedNoComment = nonBlankAdded.filter((l) => !isCommentLine(l));
  const removedNoComment = nonBlankRemoved.filter((l) => !isCommentLine(l));
  const aTok = addedNoComment.flatMap((l) => tokenize(stripComment(l)));
  const rTok = removedNoComment.flatMap((l) => tokenize(stripComment(l)));
  if (sameTokens(aTok, rTok) && (addedNoComment.length !== nonBlankAdded.length || removedNoComment.length !== nonBlankRemoved.length)) {
    return { isCosmetic: true, reason: 'comment-only change (code tokens unchanged)' };
  }

  // 3) Pure identifier rename: same structure, only identifiers differ. Compare line-aligned
  //    when counts match; otherwise compare the flattened streams.
  if (addedNoComment.length === removedNoComment.length && addedNoComment.length > 0) {
    let allRenameOrEqual = true;
    let anyRename = false;
    for (let i = 0; i < addedNoComment.length; i++) {
      const at = tokenize(stripComment(addedNoComment[i] as string));
      const rt = tokenize(stripComment(removedNoComment[i] as string));
      if (sameTokens(at, rt)) continue;
      if (identifierOnlyDiff(rt, at)) {
        anyRename = true;
        continue;
      }
      allRenameOrEqual = false;
      break;
    }
    if (allRenameOrEqual && anyRename) {
      return { isCosmetic: true, reason: 'pure identifier rename (structure unchanged)' };
    }
  }

  // Anything else changes meaningful tokens → behavioral.
  return { isCosmetic: false, reason: 'changes control flow / conditions / calls / literals' };
}
