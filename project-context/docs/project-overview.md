# Project Overview

## Vision

Reinvent self-learning. People who teach themselves fail for four reasons: they don't know **what** to learn, in **what order**, **how long** it will take, and whether they **actually understood and will retain** it. We address all four.

## Product pillars

| Pillar | What it does | Status |
|---|---|---|
| 1. Personalized roadmap (onboarding) | Questionnaire, conversational topic workshop on an editable node/edge graph, generated study plan with a weekly schedule | **Building now** |
| 2. Learning experience | Lessons and practice per leaf node, progress tracking on the graph | In progress (teammate) |
| 3. Retention | Spaced repetition (FSRS) with cards per learning objective | Later |
| 4. Demonstrated understanding | Chatbot and avatar "teach-back": the learner explains a topic and is scored against the node's objectives | Later |

The loop: learn a node, teach it back, find gaps, generate cards, schedule reviews, feed weak spots back into the graph as new nodes or prerequisites.

## Who it's for

Self-directed learners with a goal (career change, exam, project, curiosity) and limited time. They can be beginners in the topic and are not necessarily comfortable planning a curriculum.

## Onboarding experience (my portion)

Landing, anonymous session (no sign-up wall), 5-step questionnaire, workshop (graph plus chat), plan generation, plan view, handoff to the learning experience. Full spec: `onboarding-spec.md`.

Design principles:
- **Every step feeds the next.** The goal typed in step 1 generates the concept chips in step 4, which seed the workshop graph, which becomes the plan.
- **The graph is the product.** Chat is the steering wheel; the roadmap is what the learner keeps.
- **User edits are ground truth.** The AI never reverts a manual change.
- **Honest about scope.** If the time budget can't fit the topics, the AI says so and proposes cuts.

## Hackathon context

- Event: HackMIT, education track.
- Success criteria: a judge can go from "I want to learn X" to a personalized, editable plan in under 3 minutes with no sign-up, on their own phone (QR code).
- Demo path: type a specific goal, rate the concept chips, tell the chat "I already know matrices and I only have 3 hours a week", watch the graph reshape with highlighted changes, open the plan.
- Backup path: pre-generated plan cached, `MOCK_AI` fallback, seeded demo plan.

## Scope now vs later

**Now:** everything in pillar 1, plus the shared contract, `<TopicGraph>` component, and `lib/plans` read API that pillar 2 builds on.

**Later (design for, don't build):** spaced repetition, chatbot, avatar teach-back, account upgrade, multiple plans in the UI, notifications. The data contract already carries what they need: assessable `objectives`, stable node ids, `order`, review time reserved in the schedule, `tutorStyle`, `availability.timezone`.

## Team

| Role | Person |
|---|---|
| Onboarding (auth, questionnaire, workshop, plan generation) | (fill in) |
| Learning experience | (fill in) |
| Retention and avatar (later) | (fill in) |
| Design and demo | (fill in) |
