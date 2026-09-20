import type { ProviderId } from "@/lib/providers/types";
import type { Lesson, MindMap } from "@/lib/schema";
import type { DraftGraph, OnboardingState, StudyPlan } from "@/types/learning";

export type OnboardingPatch = Partial<Omit<OnboardingState, "profile">> & {
  /** Merged into the stored profile; `preferences` and `availability` merge key by key. */
  profile?: OnboardingState["profile"];
};

export interface OnboardingRepo {
  /** A fresh `questionnaire` state when nothing is stored yet. */
  get(userId: string): Promise<OnboardingState>;
  update(userId: string, patch: OnboardingPatch): Promise<OnboardingState>;
}

export type NewPlan = Pick<StudyPlan, "title" | "profile" | "graph" | "order" | "schedule">;

export interface PlanRepo {
  create(userId: string, plan: NewPlan): Promise<StudyPlan>;
  /** Null when the plan does not exist or belongs to someone else. */
  get(planId: string, userId: string): Promise<StudyPlan | null>;
  /** Most recently created plan. */
  getActive(userId: string): Promise<StudyPlan | null>;
  /** Replaces the given fields and bumps `version`. */
  update(planId: string, userId: string, patch: Partial<NewPlan>): Promise<StudyPlan>;
}

/** A generated draft roadmap kept as a past record, like a chat-history entry. */
export interface RoadmapRecord {
  id: string;
  userId: string;
  title: string;
  goal: string;
  graph: DraftGraph;
  createdAt: string;
  updatedAt: string;
}

/** What the history list needs — the graph stays out of list payloads. */
export type RoadmapSummary = Pick<RoadmapRecord, "id" | "title" | "goal" | "createdAt" | "updatedAt">;

export type NewRoadmap = Pick<RoadmapRecord, "title" | "goal" | "graph">;

export interface RoadmapRepo {
  /** Newest first. */
  list(userId: string): Promise<RoadmapSummary[]>;
  /** Null when the record does not exist or belongs to someone else. */
  get(id: string, userId: string): Promise<RoadmapRecord | null>;
  create(userId: string, roadmap: NewRoadmap): Promise<RoadmapRecord>;
  /** Null when the record does not exist or belongs to someone else. */
  update(id: string, userId: string, patch: Partial<NewRoadmap>): Promise<RoadmapRecord | null>;
}

/** A roadmap from the legacy (stage/block) flow at /legacy. */
export interface LegacyRoadmapRecord {
  id: string;
  userId: string;
  /** What the learner typed. */
  topic: string;
  /** What the learner added about their goal and what they already know. */
  details: string | null;
  provider: ProviderId;
  /** For a revised map: the change the learner asked for. */
  instruction: string | null;
  map: MindMap;
  /** False while the map is still streaming in. */
  complete: boolean;
  /** Set when generation failed; `map` is whatever arrived before. */
  error: string | null;
  model: string | null;
  generationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export type NewLegacyRoadmap = Pick<LegacyRoadmapRecord, "topic" | "details" | "provider" | "instruction" | "map"> & {
  /** True when the map is already final (a revision the assistant made); defaults to false. */
  complete?: boolean;
};

export type LegacyRoadmapPatch = Partial<Pick<LegacyRoadmapRecord, "map" | "complete" | "error" | "model" | "generationMs">>;

/** One finished roadmap, as the /legacy home page lists it. */
export interface LegacyRoadmapSummary {
  id: string;
  topic: string;
  /** The map's own cleaned-up title. */
  title: string;
  instruction: string | null;
  blocks: number;
  lessonsWritten: number;
  createdAt: string;
}

export interface LegacyRoadmapRepo {
  /** Finished roadmaps, newest first. */
  list(userId: string): Promise<LegacyRoadmapSummary[]>;
  /** Null when the roadmap does not exist or belongs to someone else. */
  get(id: string, userId: string): Promise<LegacyRoadmapRecord | null>;
  create(userId: string, roadmap: NewLegacyRoadmap): Promise<LegacyRoadmapRecord>;
  /** Null when the roadmap does not exist or belongs to someone else. */
  update(id: string, userId: string, patch: LegacyRoadmapPatch): Promise<LegacyRoadmapRecord | null>;
  /** Removes the roadmap and its lessons. */
  delete(id: string, userId: string): Promise<void>;
  /** Keys of the lessons written for a roadmap. */
  lessonKeys(id: string, userId: string): Promise<string[]>;
  getLesson(id: string, userId: string, key: string): Promise<Lesson | null>;
  saveLesson(id: string, userId: string, key: string, lesson: Lesson): Promise<void>;
  /** Carry lessons over to a revised map, for the blocks it kept. */
  copyLessons(fromId: string, toId: string, userId: string, keys: string[]): Promise<void>;
}
