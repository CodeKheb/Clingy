# Handoff: embeddings/priority work (in progress)

Updated after session 3 (ON-DEVICE TFLite test now PASSES + live Google
Classroom fetch verified end-to-end). The section immediately below supersedes
older statements where they conflict.

## Session 3 update — on-device TFLite is WORKING (read this first)

**Status: the embedded model now runs on-device and passes the sanity check.**
```
[priority] MiniLM ready — inputs: serving_default_inputs_1:0:int32[1,128] |
  serving_default_inputs:0:int32[1,128] — ids=tensor 0 (order: probed)
[priority] sanity PASS — similar=0.650 different=-0.035 order=probed
```

### The blocker that session 2 missed, and its fix
`react-native-fast-tflite` **cannot run dynamic-shape models** (open upstream
issue margelo/react-native-fast-tflite#16 since Jan 2024; no resize API exists).
Its C++ `copyInputBuffers` blindly does `TfLiteTensorCopyFromBuffer(tensor, buf,
buf->size())` with no size validation, so when the model declares `[1,1]` inputs
the 128-int buffer silently fails to copy and the interpreter runs on garbage:
```
E tflite: tflite/kernels/gather.cc:160 indices_has_only_positive_elements was not true.
E tflite: gather index out of bounds
E tflite: Node number 17 (GATHER) failed to invoke.
```
The community conversion baked the TF `None` sequence dim as `1`, so both input
tensors were literally `[1,1]` in the flatbuffer (NOT `[-1,-1]`).

**Fix applied:** rewrote the two input tensor shapes from `[1,1]` → `[1,128]`
in place in `app/assets/models/all-MiniLM-L6-v2-quant.tflite`. Verified
**bit-identical** to `resize_tensor_input([1,128])` (max abs diff 0.000000) via
`/tmp/priority_test/patch_shape.py`. The original model is backed up at
`/tmp/priority_test/all-MiniLM-L6-v2-quant.orig.tflite.bak`. If the model is ever
re-downloaded from Hugging Face, **re-apply the shape patch** or it will silently
fail on-device again. (A fixed-shape export would be the cleaner long-term answer.)

### Off-device inference is now possible too
`ai-edge-litert` (Google's LiteRT Python runtime) installs on this machine's
Python 3.14 — so the model can be exercised without the phone. Reuses the SAME
app tokenizer. Scripts are in `/tmp/priority_test/` and take paths via env/args
(NO hardcoded paths): `build_payload.js` (tokenize probes+anchors+items),
`model_infer.py` (input-order probe + sanity + scoring), `live_test.sh`
(auth-fetch → tokenizer → model), `patch_shape.py` (shape fixer/verifier).

### Live Google Classroom fetch verified
Using a real OAuth access token against the running backend (backend untouched):
`GET /classroom/coursework` → **http 200, 246 items**, contract shape OK,
tokenizer **0 UNK / 2271 pieces**, and the real TFLite model scored all 246.
So the whole pipeline (Google auth → backend → tokenizer → on-device model) is
sound. The token was ephemeral and is not stored anywhere — a fresh consent is
needed each session.

### Correction to earlier notes
- `App.tsx` did **NOT** actually call `verifyEmbeddingSanity()` before; session 2
  claimed it did. It only called `initPriorityScorer()`. Now wired in `__DEV__`
  (session 3) — that's what produced the sanity PASS above.
- The debug APK install did not need `expo-dev-client`; `app/android/app/build/
  outputs/apk/debug/app-debug.apk` installs fine and loads directly from Metro.

### Finding to decide on (not a bug)
Urgency is dominated by due-date decay, and past-due items all max out at 1.0,
so the real 246-item classroom list is topped entirely by assignments from 2025.
Heuristic does the same (~0.985). Consider clamping/capping overdue age so Cling
doesn't permanently read `urgent`.

### Unrelated pre-existing warning
`Cannot update a component ('PetWidget') while rendering a different component
('ClingSprite')` — setState during render in the pet widget, unrelated to this work.

---

## Session 2 notes (superseded where they conflict with session 3)

Session 2 ended mid-device-setup: the dev client was NOT on the phone.

## Done
- Cling floating widget (committed + pushed, commit `8c9bcc6`): sprite animation
  engine, draggable/edge-snapping fallback, mood-driven PetWidget, left/right flip.
  All working and confirmed by user on-device.
- Installed `react-native-fast-tflite` (+ its `react-native-nitro-modules` peer),
  config plugin registered in `app.json`.
- Ran `npx expo prebuild --platform android` — `app/android/` now exists (gitignored
  by default CNG convention, **not yet committed** — check `.gitignore`).
- **Dev client build completed successfully** (confirmed after this doc was first
  written — `BUILD SUCCESSFUL in 5m 11s`). **SESSION 2 CORRECTION: the dev client
  is NOT actually installed on the device** (`adb shell pm list packages -3` shows
  only `host.exp.exponent` = Expo Go; `com.anonymous.clingy` is gone/never was on
  this phone). Expo Go cannot run fast-tflite (native Nitro module). The
  `app/android` gradle project is still on disk — installing it is the next action
  (see Next steps step 1).
  - Found and fixed a real build blocker: JDK 25 (system default) trips an AGP/Prefab
    bug where a JDK "restricted method" warning gets misparsed as a fatal error.
    **Fix: always build with `JAVA_HOME=/usr/lib/jvm/java-21-openjdk`** (already
    installed on this machine, confirmed working). Also had to `unset ANDROID_SDK_ROOT`
    (conflicts with `ANDROID_HOME`, both point to different real SDK installs).
- Downloaded model + tokenizer assets (not yet committed):
  - `app/assets/models/all-MiniLM-L6-v2-quant.tflite` (~22.8MB, community conversion
    from `Nihal2000/all-MiniLM-L6-v2-quant.tflite` on Hugging Face — NOT an official
    release, verified only empirically, see below)
  - `app/assets/models/tokenizer/vocab.txt` + `tokenizer_config.json` (from the
    original `sentence-transformers/all-MiniLM-L6-v2` repo — standard BERT uncased
    vocab, 30522 tokens)
- **Verified the model empirically** using a Python venv (`/tmp/tflite_inspect_venv`,
  just the pure-Python `tflite` flatbuffer-schema package, no TF/torch needed):
  - 2 inputs, 1 output, output shape `[1, 384]` float32 — matches MiniLM-L6 embedding
    dim, confirms the conversion is legitimate.
  - Input naming is ambiguous (`inputs`/`inputs_1`, not `input_ids`/`attention_mask`),
    but traced via operator graph: tensor index **0 feeds a GATHER op → input_ids**,
    tensor index **1 only feeds SHAPE/EXPAND_DIMS/RESHAPE → attention_mask**.
  - Signature def maps `inputs_1` → tensor 0, `inputs` → tensor 1. So: **pass
    `inputs_1` = input_ids, `inputs` = attention_mask** when calling the model.
    This is the single most important fact to carry forward — getting this backwards
    will silently produce garbage embeddings.
- Wrote `app/src/priority/tokenizer.ts`: hand-rolled BERT WordPiece tokenizer
  (basic tokenize: lowercase + accent-strip + punctuation split, then greedy
  longest-match WordPiece), outputs fixed-length 128-token `inputIds`/`attentionMask`
  arrays. Reads vocab from `app/src/priority/vocab.json` (generated from vocab.txt
  via a one-off Node script — raw `.txt` import isn't viable through Metro without
  custom config, JSON import is simpler and already wired).
  - **Typechecks clean** (`./node_modules/.bin/tsc --noEmit` — verified just before
    stopping).
  - **Now Node-verified** (session 2, see Verification section) — including a fix
    for a real truncation bug that cut [SEP] off long inputs.

## Key decisions made this session (with reasoning, don't re-litigate)
- On-device TFLite over hosted API or pure heuristic — user's explicit choice,
  matches CONTRACT.md's stated stretch goal ("TFLite classifier behind
  scorePriority(), feature-flagged").
- `react-native-fast-tflite` over `onnxruntime-react-native` — actively maintained,
  zero deps, Nitro-based. `react-native-transformers` was considered but is
  **deprecated on npm** ("no longer supported") — don't revisit that package.
- Hand-rolled WordPiece tokenizer over any npm tokenizer package — confirmed no
  good RN-compatible maintained option exists.
- Community `.tflite` conversion over DIY ONNX→TFLite — DIY path is blocked on
  this machine: TensorFlow has no PyPI build for Python 3.14 (the only Python
  installed system-wide), and installing an older Python was judged not worth
  the setup time. If this changes (e.g. a venv with Python 3.11 becomes available),
  DIY conversion would give better guarantees but isn't necessary unless the
  community model proves broken.

## Backend status (verified live, session 2)
- Pulled `afcc957` (Person A: Google OAuth client config + API scopes in
  `googleClient.ts`). `.env` present in `backend/` (client id/secret/redirect URI).
- Backend runs fine: `cd backend && npx tsx src/index.ts` on port 4000. To keep it
  alive across shell sessions: `setsid nohup npx tsx src/index.ts > /tmp/backend.log
  2>&1 < /dev/null &` (plain nohup gets reaped; the tool has no background mode).
- Smoke tests PASSED:
  - `GET /health` → `{"ok":true}`
  - `GET /auth/google/url` → valid consent URL incl. classroom + calendar scopes
  - `GET /classroom/coursework` and `/calendar/events` without token → 401 guard works
- 🐞 **BUG for Person A: any bad/expired token CRASHES the whole backend.** Routes
  are `async` with no try/catch; Express 4 does not catch rejected handler promises
  → unhandled rejection kills the process (verified: bogus Bearer token →
  GaxiosError dump in log, HTTP 000, process dead). Fix: wrap async handlers or add
  a central error middleware. Until fixed, an expired token mid-session kills the
  sync pipeline.
- OAuth consent flow works end-to-end (user completed it in browser; callback page
  displayed the token JSON). The accessToken was never pasted back into the session
  though, so live-data scoring hasn't run yet. The consent code was consumed by the
  callback — a fresh consent is needed (or paste a token from wherever you have one).

## Next steps (in order)
1. **Install the dev client on the device** (session 2 stopped right here). Metro
   wiring is already verified working (see Verification), only the app is missing:
   ```bash
   cd app/android && env -u ANDROID_SDK_ROOT JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
     ./gradlew installDebug
   adb reverse tcp:8081 tcp:8081   # device reaches Metro over USB (expo run:android
                                   # normally does this; manual gradle install doesn't)
   ```
   Then launch (resolve the real activity first — `com.anonymous.clingy/.MainActivity`
   returned "does not exist" pre-install; `adb shell cmd package resolve-activity
   --brief com.anonymous.clingy` after install) and watch `adb logcat -d | grep
   -iE '\[priority\]|sanity'` for the init + sanity lines. Note: `expo-dev-client`
   is NOT in node_modules, so the debug build is the plain RN app connecting
   straight to Metro — that's fine for the TFLite test. Only rebuild native if
   gradle complains; if you do, use `JAVA_HOME=/usr/lib/jvm/java-21-openjdk` and
   `ANDROID_SDK_ROOT` unset (JDK 25/AGP-Prefab bug, see Done section).
2. ~~Write `app/src/priority/tfliteScorer.ts`.~~ **Done (not yet run on-device).**
   Loads via `loadTensorflowModel(require(...tflite), [])` (stock CPU delegate),
   encodes token ids to ArrayBuffer per the runtime-declared input dtype
   (int32/float32/int64 all handled), decodes the [1,384] float32 output, L2-
   normalizes. **The ids/mask order from the flatbuffer trace is now only a
   tie-breaker**: `initPriorityScorer()` empirically probes both orderings
   (separation between a paraphrase pair and an unrelated pair) and keeps the
   better one, so the HANDOFF mapping warning is de-risked at runtime.
3. ~~Verify the embedding is sane.~~ **Implemented; Metro path fully verified;
   blocked only on the app being installed (step 1).**
   `verifyEmbeddingSanity()` in tfliteScorer.ts (paraphrase pair should be ≥0.5
   cosine and ≥0.2 above an unrelated pair). App.tsx calls `initPriorityScorer()`
   on mount, which logs inputs metadata + runs the sanity check in `__DEV__`.
   Watch for `[priority] sanity PASS/FAIL` — that's the go/no-go on the community
   model.
4. ~~Implement `scorePriority()`.~~ **Done.** `index.ts` keeps the CONTRACT.md
   sync signature; feature flag `USE_TFLITE` (index.ts), TFLite used only after
   init resolves, heuristic is the permanent fallback (init failure, flag off, or
   per-call error). Scoring = embed title+description → best-matching urgency
   anchor (8 anchors with urgency level + baseMinutes) → blend with days-until-due
   (overdue=1, else exp(-days/7)), weights 0.7 due / 0.3 text. Pure math helpers
   (`dueUrgencyFrom`, `combineUrgency`, `suggestedMinutesFrom`, `cosineSimilarity`)
   are exported for testing.
5. **Live-data test instead of fixture (new option since the backend is live)**:
   `/tmp/priority_test/model_test.js` is ready — feed it a coursework JSON fetched
   with a real token (`curl -H "Authorization: Bearer $TOKEN"
   localhost:4000/classroom/coursework > /tmp/coursework.json && node
   /tmp/priority_test/model_test.js /tmp/coursework.json`). It validates the
   response against the PriorityInput contract, runs real text through the
   tokenizer (UNK-rate check), and prints heuristic urgency ordering. The fixture
   (`app/src/fixtures/classroomFixture.ts`) remains the fallback if the Google
   account has no Classroom data. Once trusted, wire `syncService.ts` to the live
   backend.
6. Once scorer works, unit-test urgency ordering makes sense across the fixture
   items, and confirm the heuristic fallback still works with the TFLite flag off.
   Partially covered already: a throwaway Node check (tokenizer correctness +
   heuristic ordering across all 7 fixture items) passed — heuristic order:
   overdue 0.91 > exam-tomorrow 0.89 > project 0.74 > quiz 0.41 > optional-reading
   0.37 > lab 0.25 > no-date essay 0.075. Re-run or port to a real test runner.

## Verification done so far (no test framework installed)
- `tsc --noEmit` clean; eslint clean on touched files.
- Throwaway Node check (transpile tokenizer/heuristic/fixture via tsc to /tmp,
  run assertions — script was in /tmp/priority_test/run.js, recreate if needed):
  - tokenizer: CLS/SEP/PAD/UNK ids match BERT, lowercase+punct split, accent
    stripping (naïve→naive), WordPiece subwords (token+##ization), Hangul →
    Jamo pieces (correct BERT NFD behavior, NOT [UNK]), 128-length padding + mask.
  - **Fixed a real tokenizer bug during this**: overflow truncation previously
    cut [SEP] off the end (kept CLS but lost SEP, mask all-ones). Now truncation
    preserves CLS-first/SEP-last per standard BERT.
- Not yet verified: actual TFLite inference (native module — on-device only).

## Files touched this session (uncommitted, beyond the pushed Cling commit)
- `app/package.json` / `package-lock.json` — added `react-native-fast-tflite`
- `app/app.json` — added `plugins: ["react-native-fast-tflite"]`
- `app/android/` — new, from prebuild — **RESOLVED: fully gitignored via
  `app/.gitignore` line 41 (`/android`), stays untracked per CNG convention**
- `app/assets/models/all-MiniLM-L6-v2-quant.tflite` — new, ~23MB (consider whether
  this should be committed directly or handled via Git LFS given its size)
- `app/assets/models/tokenizer/vocab.txt`, `tokenizer_config.json` — new
- `app/src/priority/tokenizer.ts` — new; **now node-verified** + SEP-truncation fix
- `app/src/priority/vocab.json` — new, generated from vocab.txt (30522 tokens)
- `app/src/fixtures/classroomFixture.ts` — new, ready to use
- `app/metro.config.js` — NEW: adds `tflite` to Metro assetExts (required for the
  model require(); without it the bundle fails)
- `app/declarations.d.ts` — NEW: `*.tflite` asset module type
- `app/src/priority/tfliteScorer.ts` — implemented: model load, dtype-aware
  ArrayBuffer encode/decode, cosine, anchor embeddings, input-order probe,
  verifyEmbeddingSanity(), scorePriorityTflite(), pure math helpers
- `app/src/priority/heuristic.ts` — implemented: due-date decay + ordered keyword
  cues (LOW beats URGENT so "optional exam reading" stays low), same 0.7/0.3 blend
  shape as TFLite so the swap is invisible to Person B
- `app/src/priority/index.ts` — `scorePriority()` wired: USE_TFLITE flag,
  TFLite-after-init else heuristic, never throws to caller; exports
  `initPriorityScorer()`
- `app/App.tsx` — fires `initPriorityScorer()` on mount (sanity check auto-runs
  in __DEV__)

None of this has been committed yet — recommend reviewing the diff and committing
in logical chunks (e.g. "add TFLite dependency + native project", "add MiniLM model
+ tokenizer assets", "add classroom fixture") rather than one giant commit.

## Session 3 files changed (beyond session 2)
- `app/assets/models/all-MiniLM-L6-v2-quant.tflite` — **content changed**: input
  tensors patched `[1,1]`→`[1,128]` (see session 3 section above). Same file path,
  so `git diff` will show a binary change to the staged asset.
- `app/App.tsx` — added the `__DEV__` `verifyEmbeddingSanity()` call after
  `initPriorityScorer()` resolves (previously missing).
- `/tmp/priority_test/` scratch tooling (NOT in the repo): `patch_shape.py`,
  `build_payload.js`, `model_infer.py`, `live_test.sh`, `inspect_flat.py`,
  `inspect_model.py`, plus `all-MiniLM-L6-v2-quant.orig.tflite.bak`. All use env
  vars/args instead of hardcoded paths.
- Backend: **untouched** (only read; ran it as-is).
