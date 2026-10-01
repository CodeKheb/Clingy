// Owner: Person C — TFLite-backed implementation of scorePriority() (CONTRACT.md section 3).
// Runs the bundled all-MiniLM-L6-v2 quantized model fully on-device and turns
// embeddings into urgency scores via cosine similarity against "urgency anchor"
// phrases, combined with days-until-due math.
//
// Usage:
//   await initPriorityScorer()   // once at app start (async: model load + anchor embeddings)
//   scorePriority(input)         // then fully synchronous, per CONTRACT.md
//
// IMPORTANT (from HANDOFF.md flatbuffer analysis): this model's tensor names are
// ambiguous (`inputs`/`inputs_1` — NOT `input_ids`/`attention_mask`). Tensor index 0
// feeds a GATHER op (input_ids), index 1 feeds SHAPE/EXPAND_DIMS/RESHAPE
// (attention_mask). Getting this backwards silently produces garbage embeddings,
// so initPriorityScorer() probes both orderings empirically and keeps the one
// with better similarity separation.

import modelAsset from '../../assets/models/all-MiniLM-L6-v2-quant.tflite';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TfliteModel, Tensor } from 'react-native-fast-tflite';

import { MAX_SEQUENCE_LENGTH, tokenize } from './tokenizer';
import type { PriorityInput, PriorityOutput } from './index';

const EMBED_DIM = 384; // all-MiniLM-L6-v2 output dimension
const DAY_MS = 24 * 60 * 60 * 1000;

// Per-HANDOFF flatbuffer trace: signature `inputs_1` → tensor 0 → GATHER = input_ids,
// signature `inputs` → tensor 1 → RESHAPE = attention_mask. Used as the tie-breaker
// default if the empirical probe below can't separate the two orderings.
const TRACED_IDS_INDEX = 0;
const TRACED_MASK_INDEX = 1;

// --- Urgency anchors ---------------------------------------------------------
// Each anchor is a phrase embedded once at init. An assignment's text urgency is
// driven by its best-matching anchor: sim * urgency. baseMinutes seeds the
// suggested-time estimate for that kind of work.
type Anchor = { text: string; urgency: number; baseMinutes: number };

const URGENCY_ANCHORS: Anchor[] = [
  { text: 'overdue assignment, submit as soon as possible for partial credit', urgency: 1.0, baseMinutes: 45 },
  { text: 'midterm exam tomorrow, cumulative, worth 30% of your grade, study', urgency: 1.0, baseMinutes: 120 },
  { text: 'final project due soon, high stakes, must be demoed live in class', urgency: 0.95, baseMinutes: 180 },
  { text: 'homework problem set due this week', urgency: 0.7, baseMinutes: 90 },
  { text: 'short quiz next week, low stakes', urgency: 0.55, baseMinutes: 45 },
  { text: 'lab report write-up due in two weeks', urgency: 0.4, baseMinutes: 90 },
  { text: 'no due date yet, instructor will announce later', urgency: 0.2, baseMinutes: 60 },
  { text: 'optional reading, not graded, just recommended background', urgency: 0.1, baseMinutes: 30 },
];

// --- Init state --------------------------------------------------------------

type ScorerState = {
  model: TfliteModel;
  idsIndex: number; // which input tensor is input_ids (resolved empirically)
  maskIndex: number; // which input tensor is attention_mask
  orderHow: InputOrder['how'];
  anchors: { anchor: Anchor; embedding: number[] }[];
};

let state: ScorerState | null = null;
let initPromise: Promise<boolean> | null = null;

export function isPriorityScorerReady(): boolean {
  return state !== null;
}

/**
 * Loads the model, resolves the input_ids/attention_mask tensor order, and
 * precomputes anchor embeddings. Resolves true when the TFLite scorer is ready,
 * false if loading failed (scorePriority() then stays on the heuristic).
 */
export function initPriorityScorer(): Promise<boolean> {
  if (state) return Promise.resolve(true);
  initPromise ??= (async () => {
    try {
      // Empty delegate list = stock CPU delegate (most predictable for this model).
      const model = await loadTensorflowModel(modelAsset, []);

      const idsIndex = model.inputs.findIndex((t) => t.name === 'inputs_1');
      const maskIndex = model.inputs.findIndex((t) => t.name === 'inputs');

      const order = await resolveInputOrder(model, idsIndex, maskIndex);

      const anchors = URGENCY_ANCHORS.map((anchor) => ({
        anchor,
        embedding: embedWithModel(model, order.idsIndex, order.maskIndex, anchor.text),
      }));

      state = { model, idsIndex: order.idsIndex, maskIndex: order.maskIndex, orderHow: order.how, anchors };

      if (__DEV__) {
        console.log(
          `[priority] MiniLM ready — inputs: ${model.inputs
            .map((t) => `${t.name}:${t.dataType}[${t.shape.join(',')}]`)
            .join(' | ')} — ids=tensor ${order.idsIndex} (order: ${order.how})`
        );
      }
      return true;
    } catch (e) {
      console.warn('[priority] TFLite scorer init failed, heuristic fallback stays active:', e);
      return false;
    }
  })();
  return initPromise;
}

// --- Inference ---------------------------------------------------------------

function encodeIds(ids: number[], dtype: Tensor['dataType']): ArrayBuffer {
  switch (dtype) {
    case 'int32':
      return Int32Array.from(ids).buffer;
    case 'float32':
      return Float32Array.from(ids).buffer;
    case 'int64': {
      const out = new BigInt64Array(ids.length);
      ids.forEach((v, i) => {
        out[i] = BigInt(v);
      });
      return out.buffer;
    }
    default:
      throw new Error(`[priority] unsupported model input dtype: ${dtype}`);
  }
}

function decodeEmbedding(buffer: ArrayBuffer, dtype: Tensor['dataType']): number[] {
  if (dtype !== 'float32') {
    throw new Error(`[priority] unsupported model output dtype: ${dtype}`);
  }
  const floats = new Float32Array(buffer);
  if (floats.length < EMBED_DIM) {
    throw new Error(`[priority] unexpected embedding length: ${floats.length} (expected ${EMBED_DIM})`);
  }
  return Array.from(floats.subarray(0, EMBED_DIM));
}

function runEmbedding(
  model: TfliteModel,
  idsIndex: number,
  maskIndex: number,
  inputIds: number[],
  attentionMask: number[]
): number[] {
  const inputBuffers: ArrayBuffer[] = new Array(model.inputs.length);
  inputBuffers[idsIndex] = encodeIds(inputIds, model.inputs[idsIndex].dataType);
  inputBuffers[maskIndex] = encodeIds(attentionMask, model.inputs[maskIndex].dataType);

  const outputs = model.runSync(inputBuffers);
  const embedding = decodeEmbedding(outputs[0], model.outputs[0].dataType);
  return l2Normalize(embedding);
}

/** Embeds arbitrary text through the loaded model (title + description combined). */
export function embedText(text: string): number[] {
  if (!state) throw new Error('[priority] TFLite scorer not initialized — call initPriorityScorer() first');
  return embedWithModel(state.model, state.idsIndex, state.maskIndex, text);
}

function embedWithModel(
  model: TfliteModel,
  idsIndex: number,
  maskIndex: number,
  text: string
): number[] {
  const { inputIds, attentionMask } = tokenize(text);
  if (inputIds.length !== MAX_SEQUENCE_LENGTH) {
    throw new Error(`[priority] tokenizer produced ${inputIds.length} tokens, expected ${MAX_SEQUENCE_LENGTH}`);
  }
  return runEmbedding(model, idsIndex, maskIndex, inputIds, attentionMask);
}

// --- Math helpers (pure, node-testable) --------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Maps time-to-due-date onto 0..1 urgency.
 * Overdue → 1, then exponential decay with a 7-day half-life-ish curve.
 * No due date → 0 (caller decides how that combines).
 */
export function dueUrgencyFrom(dueAt: string | null, now: number = Date.now()): number {
  if (dueAt === null) return 0;
  const days = (new Date(dueAt).getTime() - now) / DAY_MS;
  if (days <= 0) return 1;
  return Math.exp(-days / 7);
}

/** Combines due-date urgency and text urgency into the final 0..1 score. */
export function combineUrgency(dueUrgency: number, textUrgency: number, hasDueDate: boolean): number {
  if (!hasDueDate) {
    // No date to lean on: stay low, but reward urgency cues in the text a bit.
    return clamp01(0.05 + 0.25 * textUrgency);
  }
  return clamp01(0.7 * dueUrgency + 0.3 * textUrgency);
}

const MINUTES_MIN = 15;
const MINUTES_MAX = 240;

export function suggestedMinutesFrom(baseMinutes: number, urgencyScore: number): number {
  return Math.min(
    MINUTES_MAX,
    Math.max(MINUTES_MIN, Math.round(baseMinutes * (0.6 + 0.8 * urgencyScore)))
  );
}

// --- Input order resolution (the go/no-go de-risking) ------------------------

type InputOrder = { idsIndex: number; maskIndex: number; how: 'metadata' | 'probed' | 'traced-default' };

// Maximally separable probe pair: a paraphrase match (should be high-similarity)
// vs a topic-unrelated sentence (should be low-similarity).
const PROBE_SIMILAR_A = 'the midterm exam is tomorrow and covers chapters 1 through 8';
const PROBE_SIMILAR_B = 'tomorrow there is a big cumulative exam covering all the chapters';
const PROBE_DIFFERENT = 'my favorite pizza topping is pineapple and i enjoy long walks on the beach';

/**
 * Resolves which input tensor is input_ids vs attention_mask. Tries metadata
 * first (canonical names), falls back to an empirical probe: the correct order
 * yields clearly higher similarity separation between a paraphrase pair and an
 * unrelated pair; swapped inputs feed the mask into the GATHER and produce
 * garbage, so the separation signal is a reliable discriminator.
 */
async function resolveInputOrder(
  model: TfliteModel,
  idsIndexFromMeta: number,
  maskIndexFromMeta: number
): Promise<InputOrder> {
  if (model.inputs.length !== 2) {
    throw new Error(`[priority] expected 2 model inputs, got ${model.inputs.length}`);
  }

  if (idsIndexFromMeta >= 0 && maskIndexFromMeta >= 0 && idsIndexFromMeta !== maskIndexFromMeta) {
    return { idsIndex: idsIndexFromMeta, maskIndex: maskIndexFromMeta, how: 'metadata' };
  }

  const simFor = async (idsIndex: number, maskIndex: number): Promise<number> => {
    const a = embedWithModel(model, idsIndex, maskIndex, PROBE_SIMILAR_A);
    const b = embedWithModel(model, idsIndex, maskIndex, PROBE_SIMILAR_B);
    const c = embedWithModel(model, idsIndex, maskIndex, PROBE_DIFFERENT);
    return cosineSimilarity(a, b) - cosineSimilarity(a, c);
  };

  const sepIdsFirst = await simFor(0, 1);
  const sepMaskFirst = await simFor(1, 0);

  // Tie-breaker margin: below this the probe is inconclusive; prefer the traced mapping.
  const PROBE_MARGIN = 0.05;
  if (sepIdsFirst < sepMaskFirst - PROBE_MARGIN) {
    console.warn(`[priority] input-order probe: mask-first looks correct (sep ${sepMaskFirst.toFixed(3)} > ${sepIdsFirst.toFixed(3)})`);
    return { idsIndex: 1, maskIndex: 0, how: 'probed' };
  }
  if (sepIdsFirst < PROBE_MARGIN && sepMaskFirst < PROBE_MARGIN) {
    console.warn('[priority] input-order probe inconclusive (both orderings separate poorly) — using traced default (ids=tensor 0)');
    return { idsIndex: TRACED_IDS_INDEX, maskIndex: TRACED_MASK_INDEX, how: 'traced-default' };
  }
  return { idsIndex: 0, maskIndex: 1, how: 'probed' };
}

// --- Sanity verification (HANDOFF step 3: the real go/no-go) -----------------

export type SanityReport = {
  ok: boolean;
  inputOrder: 'metadata' | 'probed' | 'traced-default';
  similarPairSimilarity: number;
  differentPairSimilarity: number;
};

/**
 * Verifies the embedding is sane before anything builds on it (HANDOFF step 3):
 * two near-duplicate sentences must embed closely, two unrelated ones must not.
 * Run on-device after initPriorityScorer() — pass criteria are loose enough to
 * tolerate model quirks but tight enough to catch a broken conversion or a
 * swapped input order.
 */
export function verifyEmbeddingSanity(): SanityReport {
  if (!state) throw new Error('[priority] TFLite scorer not initialized — call initPriorityScorer() first');

  const similar = cosineSimilarity(embedText(PROBE_SIMILAR_A), embedText(PROBE_SIMILAR_B));
  const different = cosineSimilarity(embedText(PROBE_SIMILAR_A), embedText(PROBE_DIFFERENT));

  const ok = similar >= 0.5 && similar - different >= 0.2;
  const report: SanityReport = {
    ok,
    inputOrder: state.orderHow,
    similarPairSimilarity: similar,
    differentPairSimilarity: different,
  };

  if (__DEV__) {
    console.log(
      `[priority] sanity ${ok ? 'PASS' : 'FAIL'} — similar=${similar.toFixed(3)} different=${different.toFixed(3)} order=${report.inputOrder}`
    );
  }
  return report;
}

// --- CONTRACT.md interface ---------------------------------------------------

/** TFLite-backed scorePriority — synchronous, requires initPriorityScorer() to have resolved. */
export function scorePriorityTflite(input: PriorityInput): PriorityOutput {
  if (!state) throw new Error('[priority] TFLite scorer not initialized — call initPriorityScorer() first');

  const text = [input.title, input.description].filter(Boolean).join('. ');
  const embedding = embedText(text);

  // Text urgency: best anchor match, scaled by that anchor's urgency level.
  let textUrgency = 0;
  let bestBaseMinutes = 45;
  let bestSim = -1;
  for (const { anchor, embedding: anchorEmb } of state.anchors) {
    const sim = cosineSimilarity(embedding, anchorEmb);
    textUrgency = Math.max(textUrgency, sim * anchor.urgency);
    if (sim > bestSim) {
      bestSim = sim;
      bestBaseMinutes = anchor.baseMinutes;
    }
  }

  const dueUrgency = dueUrgencyFrom(input.dueAt);
  const urgencyScore = combineUrgency(dueUrgency, textUrgency, input.dueAt !== null);

  return {
    urgencyScore,
    suggestedMinutes: suggestedMinutesFrom(bestBaseMinutes, urgencyScore),
  };
}
