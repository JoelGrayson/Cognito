# Whiteboard — pillar 4, demonstrated understanding

The learner works a problem by hand. The system watches, checks each step, and
**mostly says nothing**. Dev page: `/dev/whiteboard`.

## Why it withholds help

A 2025 RCT: students using AI scored **57.5%** on a retention test 45 days later;
students using none scored **68.5%**. AI tutors make people feel helped and remember
less. Bjork's *desirable difficulties* explains it — storage strength grows most when
retrieval is hard, and smooth feels like learning while not being it.

So this optimizes for the inverse of every other tutor: not how much it helped, but
**how little it had to**. The headline metric is `selfCorrectionRate` — the share of
your own errors you caught unaided.

The mechanism is withholding **location**, not just the answer. "Line 3 is wrong" does
the re-reading for you; "something in here doesn't hold up" makes you audit your own
reasoning. Help is a ladder (`policy.ts`), and **the system never volunteers past rung
1** — rungs 2-5 exist only because the learner asked. That invariant has a test.

## Pipeline

```
pen → strokes.ts (line-break endpointer) → /api/whiteboard/strokes (Mathpix)
    → ink.ts (LaTeX → mathjs) → checker/numeric.ts (verdict) → policy.ts (speak?)
```

## The checker needs no CAS

`checker/numeric.ts` decides step equivalence by **evaluating both steps at ~24 random
points** and testing proportionality, rather than doing symbolic algebra. Measured
**0.03ms** per check, no dependencies beyond mathjs as a parser. Rejected SymPy via
Pyodide (8-10MB wheel, slow boot) and a Python sidecar (second deployable, network hop).

Covers algebra, inequalities (the direction rule falls out for free: `k>0` keeps the
operator, `k<0` must flip it), factoring, trig identities, log/exponent rules, and —
with numerical differentiation — derivatives and integrals.

Verdicts are a discriminated union, so `kind` *is* the misconception label:
`equivalent` | `direction` | `rescaled` | `not-equivalent` | `undetermined`.

**The asymmetry is the cost model, don't flatten it:** `equivalent` is a proof of
safety → silence, zero tokens. `not-equivalent` proves nothing (they may have divided
both sides, substituted, started a sub-derivation) → a reason to *look*, never to
speak. Twenty correct steps cost nothing.

## Endpointing

We don't detect "she stopped writing." We detect **"she started the next line"** —
pen drops down *and* returns toward the left margin. No timer, so you can pause
mid-line to think and nothing fires. Requires both conditions: vertical alone
misfires on fraction denominators, horizontal alone on writing `=` after a long term.

The one timer is a fallback for the final line (nothing follows it to commit it). It
is **provisional** — keep writing and the same `lineId` is re-read and replaces the
earlier reading, so firing early is harmless.

## Running it

```bash
pnpm install
# .env.local: MATHPIX_APP_ID, MATHPIX_APP_KEY   (console.mathpix.com, not Snip)
pnpm dev            # → /dev/whiteboard
pnpm whiteboard:test
```

`?idle=800` on the dev page tunes the final-line wait without a rebuild.

## Tests: 82 across four suites

| Suite | Covers |
|---|---|
| `checker/numeric.test.ts` | 26 — legal moves, six error classes, inequality direction, bare-expression scaling |
| `strokes.test.ts` | 12 — line-break geometry vs. fractions, subscripts, superscripts |
| `policy.test.ts` | 12 — ladder rungs, and the never-volunteers invariant |
| `scripts/corpus.ts` | 32 — Mathpix-shaped LaTeX through the real bridge |

`scripts/replay.ts` re-runs captured real handwriting (`fixtures/readings.jsonl`)
through the bridge and checker — no tablet, no network, no human.

## Notes for whoever picks this up

- **tldraw docs are out of date.** As of 5.x a draw segment has no `points` array; it
  has `path: string`, delta-encoded base64. Decode with `b64Vecs.decodePoints`.
- mathjs is **lazily imported** in the page. Eager-importing it put 15.2MB across 54
  files into the initial load in dev and stopped phones hydrating at all.
- Mathpix `strokes_session_id` bills per *drawing session*, not per call — so reading
  continuously while someone writes costs the same as reading once. Not used yet.
- Fixture capture is dev-only; serverless filesystems are read-only.

## Not built yet

Voice, the AI drawing back onto the canvas, and wiring to a plan node's `objectives`.
