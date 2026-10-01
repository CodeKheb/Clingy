// Owner: Person C — BERT-style WordPiece tokenizer for the bundled MiniLM TFLite model.
// Hand-rolled (no RN-compatible maintained tokenizer package exists for this) against
// assets/models/tokenizer/vocab.txt, matching BertTokenizer(do_lower_case=true) behavior.

import vocabList from './vocab.json';

const CLS_TOKEN = '[CLS]';
const SEP_TOKEN = '[SEP]';
const PAD_TOKEN = '[PAD]';
const UNK_TOKEN = '[UNK]';
const MAX_WORDPIECE_CHARS = 200;

// Fixed input length of the bundled MiniLM model — must match its input shape.
export const MAX_SEQUENCE_LENGTH = 128;

let vocabCache: Map<string, number> | null = null;

function loadVocab(): Map<string, number> {
  if (vocabCache) return vocabCache;
  const map = new Map<string, number>();
  const tokens = vocabList as string[];
  for (let i = 0; i < tokens.length; i++) {
    map.set(tokens[i], i);
  }
  vocabCache = map;
  return map;
}

// Mirrors BasicTokenizer: lowercase, strip accents, split on whitespace and punctuation.
function basicTokenize(text: string): string[] {
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens: string[] = [];
  let current = '';

  const isPunctuation = (ch: string) => /[!-/:-@[-`{-~]/.test(ch);
  const isWhitespace = (ch: string) => /\s/.test(ch);

  for (const ch of lower) {
    if (isWhitespace(ch)) {
      if (current) tokens.push(current);
      current = '';
    } else if (isPunctuation(ch)) {
      if (current) tokens.push(current);
      current = '';
      tokens.push(ch);
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// Mirrors WordpieceTokenizer: greedy longest-match-first against the vocab.
function wordpieceTokenize(word: string, vocab: Map<string, number>): string[] {
  if (word.length > MAX_WORDPIECE_CHARS) return [UNK_TOKEN];

  const pieces: string[] = [];
  let start = 0;
  while (start < word.length) {
    let end = word.length;
    let matched: string | null = null;
    while (start < end) {
      let candidate = word.slice(start, end);
      if (start > 0) candidate = `##${candidate}`;
      if (vocab.has(candidate)) {
        matched = candidate;
        break;
      }
      end--;
    }
    if (matched === null) return [UNK_TOKEN];
    pieces.push(matched);
    start = end;
  }
  return pieces;
}

export type TokenizedInput = {
  inputIds: number[];
  attentionMask: number[];
};

// Tokenizes text into fixed-length (MAX_SEQUENCE_LENGTH) input_ids + attention_mask
// arrays, padded/truncated, with [CLS]/[SEP] added per standard BERT input formatting.
export function tokenize(text: string): TokenizedInput {
  const vocab = loadVocab();
  const words = basicTokenize(text);

  const pieces: string[] = [CLS_TOKEN];
  for (const word of words) {
    pieces.push(...wordpieceTokenize(word, vocab));
  }
  pieces.push(SEP_TOKEN);

  // Truncate keeping [CLS] first and [SEP] last (standard BERT behavior):
  // keep CLS + first (MAX - 2) body pieces, then re-append SEP in the final slot.
  if (pieces.length > MAX_SEQUENCE_LENGTH) {
    pieces.splice(MAX_SEQUENCE_LENGTH - 1, pieces.length, SEP_TOKEN);
  }

  const inputIds = pieces.map((t) => vocab.get(t) ?? vocab.get(UNK_TOKEN)!);
  const attentionMask = new Array(inputIds.length).fill(1);

  while (inputIds.length < MAX_SEQUENCE_LENGTH) {
    inputIds.push(vocab.get(PAD_TOKEN)!);
    attentionMask.push(0);
  }

  return { inputIds, attentionMask };
}
