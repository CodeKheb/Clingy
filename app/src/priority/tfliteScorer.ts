// TFLite-backed implementation of scorePriority() (see src/priority/index.ts).
// Runs the bundled all-MiniLM-L6-v2 quantized model fully on-device and turns
// embeddings into urgency scores via cosine similarity against "urgency anchor"
// phrases, combined with days-until-due math.
//
// Usage:
//   await initPriorityScorer()   // once at app start (async: model load + anchor embeddings)
//   scorePriority(input)         // then fully synchronous
//
// IMPORTANT (from analysing the model's flatbuffer): this model's tensor names are
// ambiguous (`inputs`/`inputs_1` — NOT `input_ids`/`attention_mask`). Tensor index 0
// feeds a GATHER op (input_ids), index 1 feeds SHAPE/EXPAND_DIMS/RESHAPE
// (attention_mask). Getting this backwards silently produces garbage embeddings,
// so initPriorityScorer() probes both orderings empirically and keeps the one
// with better similarity separation.

import { NativeModules } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TfliteModel, Tensor } from 'react-native-fast-tflite';

import { MAX_SEQUENCE_LENGTH, tokenize } from './tokenizer';
import type { TaskType } from './taskProfile';

const EMBED_DIM = 384; // all-MiniLM-L6-v2 output dimension

// From tracing the model's flatbuffer: signature `inputs_1` → tensor 0 → GATHER = input_ids,
// signature `inputs` → tensor 1 → RESHAPE = attention_mask. Used as the tie-breaker
// default if the empirical probe below can't separate the two orderings.
const TRACED_IDS_INDEX = 0;
const TRACED_MASK_INDEX = 1;

// Sentences describing each kind of coursework; the model matches an assignment's
// text to the closest one when keywords can't tell (see taskProfile.ts).
const TYPE_ANCHORS: { type: TaskType; text: string }[] = [
  { type: 'exam', text: 'quiz or exam, prepare and study for the test' },
  { type: 'exam', text: 'midterm or final examination covering the lessons' },
  { type: 'project', text: 'group project, build a prototype and present or demo it' },
  { type: 'project', text: 'final output, system design, implementation and presentation' },
  { type: 'writing', text: 'write an essay, paper or reflection and submit the document' },
  { type: 'writing', text: 'written report with analysis, discussion and conclusion' },
  { type: 'problemset', text: 'homework, solve the problems and exercises' },
  { type: 'problemset', text: 'activity sheet, answer the questions and compute' },
  { type: 'admin', text: 'submit a screenshot or proof, fill out a form or survey' },
  { type: 'reading', text: 'optional reading or video to watch, background material' },
];

// Below this cosine similarity the text isn't a convincing match for any type.
const TYPE_MATCH_THRESHOLD = 0.3;


const MODEL_FILE = 'all-MiniLM-L6-v2-quant.tflite';

/** file:// path of the model copied out of the app's native assets (see plugins/overlay/native/ModelAssetModule.kt). */
async function bundledModelUrl(): Promise<string> {
  const native = NativeModules.ClingModelAsset as { prepare(name: string): Promise<string> } | undefined;
  if (!native) throw new Error('ClingModelAsset native module is missing (Android only)');
  return native.prepare(MODEL_FILE);
}

// --- Init state --------------------------------------------------------------

type ScorerState = {
  model: TfliteModel;
  idsIndex: number; // which input tensor is input_ids (resolved empirically)
  maskIndex: number; // which input tensor is attention_mask
  orderHow: InputOrder['how'];
  typeAnchors: { type: TaskType; embedding: number[] }[];
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
      const model = await loadTensorflowModel({ url: await bundledModelUrl() }, []);

      const idsIndex = model.inputs.findIndex((t) => t.name === 'inputs_1');
      const maskIndex = model.inputs.findIndex((t) => t.name === 'inputs');

      const order = await resolveInputOrder(model, idsIndex, maskIndex);

      const typeAnchors = TYPE_ANCHORS.map(({ type, text }) => ({
        type,
        embedding: embedWithModel(model, order.idsIndex, order.maskIndex, text),
      }));

      state = { model, idsIndex: order.idsIndex, maskIndex: order.maskIndex, orderHow: order.how, typeAnchors };

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

// --- Sanity verification (the real go/no-go for the community model) -----------------

export type SanityReport = {
  ok: boolean;
  inputOrder: 'metadata' | 'probed' | 'traced-default';
  similarPairSimilarity: number;
  differentPairSimilarity: number;
};

/**
 * Verifies the embedding is sane before anything builds on it:
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

/** Closest task type by embedding similarity, or null if nothing is a convincing match. Requires init. */
export function classifyTypeTflite(title: string, description: string | null): TaskType | null {
  if (!state) return null;
  const embedding = embedText([title, description].filter(Boolean).join('. '));
  let best: { type: TaskType; sim: number } | null = null;
  for (const { type, embedding: anchorEmb } of state.typeAnchors) {
    const sim = cosineSimilarity(embedding, anchorEmb);
    if (!best || sim > best.sim) best = { type, sim };
  }
  return best && best.sim >= TYPE_MATCH_THRESHOLD ? best.type : null;
}

// --- Public interface ---------------------------------------------------
