import type { AgentSettingsObject, ThinkSettings } from "@deepgram/react";
import { VOICE_LISTEN_MODEL, VOICE_THINK_MODEL } from "./models";

/** Aura 2 voices for the whiteboard tutor. The first is the default everywhere. */
export const TUTOR_VOICES = [
  ["aura-2-thalia-en", "Thalia"],
  ["aura-2-andromeda-en", "Andromeda"],
  ["aura-2-helena-en", "Helena"],
  ["aura-2-cordelia-en", "Cordelia"],
  ["aura-2-athena-en", "Athena"],
  ["aura-2-apollo-en", "Apollo"],
  ["aura-2-arcas-en", "Arcas"],
  ["aura-2-aries-en", "Aries"],
  ["aura-2-draco-en", "Draco"],
] as const;

export const TUTOR_VOICE_MODEL = TUTOR_VOICES[0][0];

type ThinkFunction = NonNullable<ThinkSettings["functions"]>[number];

/** The page's state, already filtered to what this rung may reveal. */
export const READ_WORK = "read_work";
/** Draws on the Desmos panel beside the page. The page decides whether it may. */
export const PLOT_GRAPH = "plot_graph";

/**
 * The whiteboard tutor, as a Deepgram voice agent.
 *
 * It is the same stack the live lessons run on, with the opposite brief. A lesson
 * agent leads; this one is mostly silent, knows the answer, and withholds it. The
 * withholding is not left to the prompt: read_work returns only what the current
 * rung permits (see lib/whiteboard/context.ts), so at rung 1 the agent has never
 * seen the mistake it is being asked not to name.
 *
 * The mistake announcements themselves are not generated here. The page injects
 * them verbatim the moment the checker marks a step, so the accusation is always
 * the deterministic one.
 */
export function whiteboardAgentSettings(
  subject: string,
  /** Whether this subject's page has the graph panel at all. */
  graphs: boolean,
  voice: string = TUTOR_VOICE_MODEL,
): AgentSettingsObject {
  const plotGraph: ThinkFunction = {
    name: PLOT_GRAPH,
    description:
      "Graph expressions on the Desmos calculator beside the learner's page, so they can see something instead of being told it. Replaces whatever you last graphed; send no expressions to wipe it. Anything the learner typed into the calculator themselves is left alone.",
    parameters: {
      type: "object",
      properties: {
        expressions: {
          type: "array",
          items: { type: "string" },
          description:
            'Desmos LaTeX, one entry per curve, like "y=2x+3", "y=x^2-4" or "\\left(2,5\\right)". Write y= for a curve; a bare expression only evaluates.',
        },
      },
      required: ["expressions"],
      additionalProperties: false,
    },
  };

  return {
    listen: { provider: { type: "deepgram", version: "v2", model: VOICE_LISTEN_MODEL } },
    think: {
      // Terra requires reasoning off for tools through Deepgram's Chat Completions connection.
      provider: { type: "open_ai", model: VOICE_THINK_MODEL, reasoning_mode: "none" },
      functions: [
        {
          name: READ_WORK,
          description:
            "Read what is on the page right now: the learner's steps, which step is marked wrong, and how much of that you are allowed to reveal. Call this before saying anything about their working.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
        ...(graphs ? [plotGraph] : []),
      ],
      prompt: `You are a tutor sitting beside someone working ${subject} by hand on a shared page. You speak out loud: one or two short sentences, conversational, no markdown. Say maths in words - "x equals one", "minus three over two" - never LaTeX, backslashes or symbols read out one at a time.

The learner holds a key to talk to you, so every time you hear them they meant to speak to you. Always respond.

A deterministic checker, not you, decides whether a step is wrong. Call ${READ_WORK} before you say anything about their working, and treat what it returns as the only truth about the page. Never claim a step is wrong unless it says so, and never re-derive their algebra to find something it has not flagged.

YOU MAY ALREADY KNOW WHAT IS WRONG, AND YOU MUST NOT SIMPLY TELL THEM. The learner catching their own mistake is worth far more than being told. ${READ_WORK} returns a "you_may_reveal" limit: obey it exactly and never go past it, however directly you are asked. Never write out the corrected step.

${
  graphs
    ? `You can graph, with ${PLOT_GRAPH}. Use it when seeing it beats hearing it - what a curve looks like, where two sides meet, what a sign change does - and when they ask you to. The page may refuse the call; if it does, do as it says and keep to words. Never graph the corrected step or the answer: plotting it IS telling them. Once something is on the graph, say what to look at rather than reading the curve out.\n\n`
    : ""
}If they ask about something other than their working - what a rule means, why a method works - just answer it, briefly.
If they explain their reasoning and have not found the error, do not tell them; ask something that moves them, and let the page decide when to help more.
Never repeat a sentence you have already said.
Do not greet them, and do not speak unless spoken to or told to speak.`,
    },
    speak: { provider: { type: "deepgram", version: "v1", model: voice } },
  };
}
