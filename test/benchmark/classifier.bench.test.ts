/**
 * Classifier label-set measurement — #34 / Part H.2.
 *
 * Measures the MERGED engine's `classifyChange` (D.1) against the hand-labeled set in
 * test/fixtures/labels/classifierLabels.ts and asserts precision/recall ≥ 0.9, with
 * "cosmetic" as the positive class. If the engine regresses on the labels, this fails.
 *
 * Ownership: test/benchmark/ + test/fixtures/labels/.
 */

import { describe, expect, it } from 'vitest';
import { classifyChange } from '../../src/provenance/classifier.js';
import { CLASSIFIER_LABELS } from '../fixtures/labels/classifierLabels.js';

interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

function confusion(): Confusion {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const label of CLASSIFIER_LABELS) {
    const predicted = classifyChange({
      added: label.added,
      removed: label.removed,
      ...(label.pathChanged !== undefined ? { pathChanged: label.pathChanged } : {}),
    }).isCosmetic;
    if (predicted && label.isCosmetic) tp += 1;
    else if (predicted && !label.isCosmetic) fp += 1;
    else if (!predicted && label.isCosmetic) fn += 1;
    else tn += 1;
  }
  return { tp, fp, fn, tn };
}

describe('classifier vs hand-labeled set (#34, positive class = cosmetic)', () => {
  it('the label set is non-trivial (both classes present)', () => {
    const cosmetic = CLASSIFIER_LABELS.filter((l) => l.isCosmetic).length;
    const behavioral = CLASSIFIER_LABELS.length - cosmetic;
    expect(cosmetic).toBeGreaterThanOrEqual(5);
    expect(behavioral).toBeGreaterThanOrEqual(5);
  });

  it('achieves precision ≥ 0.9 and recall ≥ 0.9', () => {
    const { tp, fp, fn } = confusion();
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    expect(precision, `precision=${precision} (tp=${tp} fp=${fp})`).toBeGreaterThanOrEqual(0.9);
    expect(recall, `recall=${recall} (tp=${tp} fn=${fn})`).toBeGreaterThanOrEqual(0.9);
  });

  it('reports each disagreement by name (diagnostic)', () => {
    const misses = CLASSIFIER_LABELS.filter((label) => {
      const predicted = classifyChange({
        added: label.added,
        removed: label.removed,
        ...(label.pathChanged !== undefined ? { pathChanged: label.pathChanged } : {}),
      }).isCosmetic;
      return predicted !== label.isCosmetic;
    }).map((l) => l.name);
    // We allow up to one disagreement and still clear the 0.9 bar; surface them if any.
    expect(misses, `disagreements: ${misses.join(', ') || 'none'}`).toEqual([]);
  });
});
