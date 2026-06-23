/**
 * Fake LLM provider — A6 (Narrator), issue #30. PHASE 0 STUB.
 *
 * Deterministic output derived from the prompt, so the entire system is testable with no
 * network and no key (Part F.2). This is what every unit/integration test and the
 * benchmark's offline mode use.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export class FakeProvider implements LlmProvider {
  readonly name = 'fake';

  complete(_input: LlmCompletionInput): Promise<string> {
    throw new NotImplemented('FakeProvider.complete (#30)');
  }
}
