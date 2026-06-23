/**
 * Shared error types — implement.md Part C.
 *
 * `NotImplemented` is what every Phase 0 stub throws, so the project compiles and the
 * dependency wiring is real before any module is filled in.
 *
 * OWNED BY LEAD.
 */

/** Thrown by Phase 0 stubs. Specialists replace the throw with the real implementation. */
export class NotImplemented extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = 'NotImplemented';
  }
}

/** A user-facing, actionable error (bad config, missing key, unresolvable repo, etc.). */
export class ArchaeoError extends Error {
  /** Process exit code the CLI should use. */
  readonly exitCode: number;
  /** Optional hint printed to guide the user (e.g. which env var to set). */
  readonly hint?: string;

  constructor(message: string, opts: { exitCode?: number; hint?: string } = {}) {
    super(message);
    this.name = 'ArchaeoError';
    this.exitCode = opts.exitCode ?? 1;
    this.hint = opts.hint;
  }
}

/** Could not resolve the LLM provider key (Part G). */
export class MissingKeyError extends ArchaeoError {
  constructor(message: string, hint: string) {
    super(message, { exitCode: 3, hint });
    this.name = 'MissingKeyError';
  }
}

/** Could not resolve the host token (Part G). */
export class MissingTokenError extends ArchaeoError {
  constructor(message: string, hint: string) {
    super(message, { exitCode: 3, hint });
    this.name = 'MissingTokenError';
  }
}
