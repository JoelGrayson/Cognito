# Onboarding Spec

Owner: onboarding. Scope: landing CTA, questionnaire, topic workshop, plan generation, plan view. Types and decisions referenced here are defined in `data-contract.md`.

## Success criteria

- A new learner goes from goal to a saved, editable plan in **under 3 minutes**.
- Every step persists; a refresh at any point restores the learner where they were.
- Works fully offline of the AI with `MOCK_AI=true`.
- Every AI failure has a defined fallback; the flow never dead-ends.
- Graph never contains cycles, dangling edges, or more than 30 nodes.

---

## 1. Screens and behavior

### 1.1 Landing

- One CTA: **Start learning**. Ensures a session (Phase 0: stub, Phase 1: anonymous sign-in), then routes to `/onboarding`.
- If the user already has a plan, the CTA routes to that plan instead (`getUserState`).

### 1.2 Questionnaire (5 steps, one question per screen)

Progress bar, Back button that preserves answers, Enter to continue, every answer persisted on step change.

| Step | Question | Input | Validation | Writes |
|---|---|---|---|---|
| 1 | What do you want to learn? | Free text with example placeholders | 3 to 200 chars, required | `goal` |
| 2 | Why, and by when? | Chips (career, exam, project, curiosity) + optional date | `goalType` required; `deadline` must be in the future | `goalType`, `deadline` |
| 3 | How much time can you give? | Slider (1 to 40 hrs/week, default 5), pace chips (relaxed, steady, intense), days per week (1 to 7) | `hoursPerWeek >= 1` | `hoursPerWeek`, `preferences.pace`, `availability.daysPerWeek` |
| 4 | Where are you starting from? | 6 to 8 Claude-generated concept chips; rate each: never heard (0), heard of (1), can explain (2) | Default 0; "Skip" allowed | `priorKnowledge` |
| 5 | How do you like to learn? | Format multi-select (reading, video, practice, discussion, "talk it out" = voice), tutor style chips (encouraging, socratic, rigorous), optional constraints text | at least 1 format | `preferences.formats`, `tutorStyle`, `constraints` |

Behavior details:

- **Prefetch:** fire `POST /api/onboarding/concepts` as soon as step 1 is submitted, in the background. By step 4 the chips should be ready. If not, show a short skeleton, never block navigation.
- **Timezone** is captured silently into `availability.timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Never asked.
- **Concept fallback:** if the concepts call fails or times out (8s), step 4 becomes a single selector (beginner, intermediate, advanced) that maps to synthetic `priorKnowledge` (0, 1, 2 applied to the goal itself).
- **Resume:** on load, `GET /api/onboarding` returns `{ step, profile }`; jump to the first incomplete step.
- On completing step 5: set `step = "workshop"` and navigate to the workshop.

### 1.3 Workshop (graph plus chat)

Layout: graph is the hero (full width). Chat is a collapsible right panel. Toolbar: **Undo**, **Regenerate**, **Build my plan**.

On entry:
1. If `draftGraph` exists, load it. Otherwise call `POST /api/workshop/generate`.
2. While generating: skeleton graph and a status line ("Mapping your roadmap..."). On return, reveal nodes with a short staggered animation.
3. If the fallback graph was used, show a dismissible banner: "We built a simple roadmap from your answers. Tell me what to change."

Interactions:

- **Click a node** to open the inspector: edit title and summary, toggle scope (included, known, excluded), delete (draft only), add a child node. All edits become `GraphOp[]` and go through `applyOps` then `validateGraph`.
- **Chat turn:** `POST /api/workshop/edit`. Response `{ message, ops, graph }`. The client applies the new graph, highlights touched node ids for about 2 seconds, shows Claude's message, and stores the previous graph for **Undo** (one level is enough).
- **User edits are ground truth.** Direct edits since the last chat turn are sent as `userEditLog`; Claude must not revert them.
- **Scope pushback:** if included `estMinutes` exceed what `hoursPerWeek` allows before the deadline, Claude says so in the message and proposes demotions (as ops). It never silently drops topics.
- **Regenerate** asks for confirmation (it discards manual edits), then calls generate again.
- Messages are 1 to 3 sentences, at most one clarifying question per turn.

**Build my plan** sets `step = "generating"` and navigates to the generating screen.

### 1.4 Plan generation screen

- Status lines that advance as module enrichments complete ("3 of 8 modules ready"), then "Building your schedule".
- Success: redirect to `/plan/[planId]`.
- Failure of the whole generation: return to the workshop with a toast, draft preserved.

### 1.5 Plan view (`/plan/[planId]`)

- `<TopicGraph mode="view">` with progress coloring (supplied later by the learning experience).
- Summary line: "12 topics, 24 hours, finishes Oct 28 at 4 hrs/week."
- Week filter: selecting a week dims nodes outside it.
- Overshoot banner when the schedule ends after the deadline, with a suggestion to demote optional nodes. Not blocking.
- **Start learning** goes to `/plan/[planId]/learn/[nodeId]` where `nodeId = getNextNode(...)`. Until the learning experience exists, that route is a placeholder page.
- **Edit topics** performs edits through `applyPlanOps` (removal becomes `scope: "excluded"`) and re-runs the scheduler (no LLM call).

---

## 2. API routes

All routes: zod-validate the body, get `userId` from `requireUserId()`, return JSON, never trust a client-provided user id.

| Method and path | Request | Response | Side effects |
|---|---|---|---|
| `GET /api/onboarding` | none | `{ step, profile, draftGraph, messages }` | none |
| `PATCH /api/onboarding` | `{ profile?: Partial<LearnerProfile>, step? }` | `{ step, profile }` | upsert onboarding record |
| `POST /api/onboarding/concepts` | `{ goal }` | `{ concepts: string[] }` | none |
| `POST /api/workshop/generate` | none | `{ graph: DraftGraph, usedFallback: boolean }` | saves `draftGraph` |
| `POST /api/workshop/edit` | `{ message, userEditLog?: GraphOp[] }` | `{ message, ops, graph, applied: boolean }` | saves `draftGraph`, appends messages |
| `PATCH /api/workshop/graph` | `{ ops: GraphOp[] }` | `{ graph }` | saves `draftGraph` (manual edits) |
| `POST /api/plan/generate` | none (`maxDuration = 60`) | `{ planId }` | inserts plan, sets `step = "done"` |
| `GET /api/plan/[planId]` | none | `StudyPlan` | none |
| `PATCH /api/plan/[planId]/graph` | `{ ops: GraphOp[] }` | `StudyPlan` | `applyPlanOps`, bumps `version`, recomputes `order` and `schedule` |

Errors: `400` with `{ errors: string[] }` for validation failures, `404` for unknown plan, `500` with a generic message. Never leak stack traces.

---

## 3. Graph semantics

- **`applyOps(graph, ops)`** is pure, returns a new graph, and throws `GraphOpError` on any op that targets a missing id (no silent no-ops).
- **Draft `remove_node`:** removes the node, its incident edges, and its children.
- **Saved-plan `remove_node`** (via `applyPlanOps`): converts to `scope: "excluded"` on the node and its children. Edges stay.
- **Ids:** server dedupes collisions on `add_node` with a numeric suffix (`_2`, `_3`).
- **Containers:** a node is a container if any node has it as `parentId`. Containers must have `estMinutes: 0`; UI shows the sum of children.
- **Only `prerequisite` edges** constrain order; `related` edges are visual.
- **`validateGraph` checks:** unique ids matching the id pattern; edges reference existing nodes, no self loops; `parentId` targets a top-level node (max depth 2); prerequisite edges form a DAG (Kahn); container `estMinutes` is 0; at most 30 nodes. Returns `{ ok: true }` or `{ ok: false, errors: string[] }`.

## 4. Scheduler

`computeOrderAndSchedule(graph, profile, { reviewShare = 0.2 })` returns `{ order, schedule, overshoot? }`.

1. Keep leaf nodes with `scope: "included"`.
2. Topologically sort **core** nodes by prerequisite edges (ties broken by array order, so output is deterministic); expand each into its children in array order.
3. Append `optional` nodes after core nodes.
4. `capacity = hoursPerWeek * 60 * (1 - reviewShare)` minutes per week.
5. Walk the order accumulating `estMinutes`; `week = floor(cumulativeBefore / capacity) + 1`. Build `ScheduleWeek[]` (`week`, `nodeIds`, `minutes`).
6. If `deadline` is set and the last week ends after it, return `overshoot: { lastWeek, deadlineWeek }`.

Edge cases: `known` and `excluded` nodes are skipped; a leaf longer than one week's capacity still occupies its start week; `hoursPerWeek` is validated at least 1 so capacity is never zero.

---

## 5. AI functions (`lib/ai`)

Every function: one forced tool, zod-validated output, retry once with errors, mock under `MOCK_AI`, defined fallback.

| Function | Model | Tool | Output | Fallback |
|---|---|---|---|---|
| `generateConcepts(goal)` | `FAST_MODEL` | `set_concepts` | `{ concepts: string[] }` (6 to 8) | Beginner/intermediate/advanced selector |
| `generateGraph(profile)` | `STRONG_MODEL` | `set_graph` | `DraftGraph` | Linear graph from concept ratings |
| `editGraph({ profile, graph, userEditLog, messages, message })` | `FAST_MODEL` (upgrade if op quality is poor) | `edit_graph` | `{ message, ops: GraphOp[] }` | Reply with message only, graph unchanged, banner |
| `enrichModule({ profile, coreNode, nodes })` | `STRONG_MODEL` | `set_objectives` | `{ nodes: { id, objectives: string[], estMinutes?: number }[] }` | Objective `Explain <title> in your own words` |

### Prompt rules

**`generateConcepts`:** 6 to 8 concepts, ordered foundational to advanced, 1 to 4 words each, specific to the goal, no duplicates.

**`generateGraph`:**
- 6 to 10 `core` spine nodes in learning order connected by `prerequisite` edges, each with 2 to 5 subtopics via `parentId`, plus a few `optional` branches.
- Concepts the learner rated 2 start as `scope: "known"`.
- Total `estMinutes` of included leaves should fit `hoursPerWeek` up to the deadline. If not, demote lower-priority nodes to `optional` or `excluded` and say so.
- Stable lowercase snake_case ids. No coordinates. Summaries under 140 characters. Containers have `estMinutes: 0`. At most 30 nodes.

**`editGraph`:**
- User edits are ground truth; never revert them.
- Return the smallest set of ops that satisfies the request. Preserve existing ids.
- Push back on scope when the plan can't fit the time budget.
- Message is 1 to 3 sentences, at most one clarifying question.
- Input uses compact serialization (`id | title | kind | scope | parentId`, edges as `a>b (kind)`), the profile, the `userEditLog`, and the last 6 chat messages.

**`enrichModule`:**
- 2 to 4 objectives per leaf, each an assessable statement starting with an action verb (explain, derive, compare, implement, predict, critique), under 120 characters, never a bare topic name.
- Confirm or adjust leaf `estMinutes` (realistic range 15 to 90).
- One call per core node (with its children), run in parallel with `Promise.allSettled`.

### Fallback matrix

| Failure | Response |
|---|---|
| Concepts call fails or exceeds 8s | Static level selector on step 4 |
| `generateGraph` invalid after retry | Linear fallback graph, banner in workshop |
| `editGraph` invalid after retry | Message only, graph unchanged, banner "I couldn't apply that change" |
| `enrichModule` fails for a module | Fallback objectives for that module, plan still ships |
| Whole plan generation fails | Back to workshop, draft preserved, toast |
| Deadline overshoot | Warning banner, non-blocking |

Linear fallback graph: each rated concept becomes a `core` leaf (`estMinutes` 60), chained by `prerequisite` edges in ascending self-rating order; concepts rated 2 get `scope: "known"`.

---

## 6. State checklist (every screen)

- Loading state (skeleton or status text)
- Error state with a recovery action
- Empty state (no concepts, no messages)
- Mobile layout at 390px width
- Keyboard operable; visible focus

## 7. Acceptance scenarios

1. **Refresh-safe:** answer steps 1 to 3, refresh, land on step 4 with answers intact.
2. **Concept prefetch:** submit step 1; by step 4 chips render without a wait (with `MOCK_AI` and a 1s mock delay).
3. **Concept failure:** force a failure; step 4 shows the level selector and the flow completes.
4. **Chat reshapes graph:** in the workshop send "skip the calculus, I only have 3 hours a week"; ops are applied, touched nodes highlight, Undo restores the previous graph.
5. **Invalid ops rejected:** a mocked cycle-creating op leaves the graph unchanged and shows the banner.
6. **Manual edit persists:** rename a node, refresh, the rename remains.
7. **Plan generation:** produces a saved plan with `order`, `schedule`, and objectives on every leaf, even when one module's enrichment is forced to fail.
8. **Overshoot:** set 1 hr/week with a 2-week deadline; the banner appears on the plan view.
9. **Saved plan removal:** removing a node in a saved plan sets `scope: "excluded"`; the node id still exists.

## 8. Cut list (drop in this order)

1. Account upgrade (Google or email linking)
2. Staggered node reveal animation
3. Claude-generated concept chips (use the level selector)
4. Undo
5. Deadline overshoot warnings
6. Chat in the workshop (keep click-to-edit and one generated graph)
7. Objectives enrichment (ship the schedule only)

**Never cut:** data contract, validation and fallback graph, stub plan for teammates, saved-plan handoff.
