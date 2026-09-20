import type { Lesson } from "@/lib/schema";
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
export type RoadmapSummary = Pick<RoadmapRecord, "id" | "title" | "goal" | "createdAt" | "updatedAt"> & {
  /** Nodes the learner can open as modules (scope "included"). */
  modules: number;
  lessonsWritten: number;
};

export type NewRoadmap = Pick<RoadmapRecord, "title" | "goal" | "graph">;

export interface RoadmapRepo {
  /** Newest first. */
  list(userId: string): Promise<RoadmapSummary[]>;
  /** Null when the record does not exist or belongs to someone else. */
  get(id: string, userId: string): Promise<RoadmapRecord | null>;
  create(userId: string, roadmap: NewRoadmap): Promise<RoadmapRecord>;
  /** Null when the record does not exist or belongs to someone else. */
  update(id: string, userId: string, patch: Partial<NewRoadmap>): Promise<RoadmapRecord | null>;
  /** Removes the roadmap and its lessons. No-op when it is missing or someone else's. */
  delete(id: string, userId: string): Promise<void>;
  /** Ids of the nodes whose lesson has been written. */
  lessonNodeIds(id: string, userId: string): Promise<string[]>;
  getLesson(id: string, userId: string, nodeId: string): Promise<Lesson | null>;
  /** Upserts; throws when the roadmap is missing or someone else's. */
  saveLesson(id: string, userId: string, nodeId: string, lesson: Lesson): Promise<void>;
}
