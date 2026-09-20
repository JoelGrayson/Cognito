import { countBlocks } from "@/lib/roadmap";
import type { Lesson } from "@/lib/schema";
import type { OnboardingProfile, OnboardingState, StudyPlan } from "@/types/learning";
import type {
  LegacyRoadmapRecord,
  LegacyRoadmapRepo,
  OnboardingPatch,
  OnboardingRepo,
  PlanRepo,
  RoadmapRecord,
  RoadmapRepo,
} from "./types";

// Held on globalThis so dev hot reloads don't wipe the data.
const g = globalThis as typeof globalThis & {
  __memoryRepo?: {
    onboarding: Map<string, OnboardingState>;
    plans: Map<string, StudyPlan>;
    roadmaps: Map<string, RoadmapRecord>;
    legacyRoadmaps: Map<string, LegacyRoadmapRecord>;
    /** Lessons by `${roadmapId}:${key}`. */
    legacyLessons: Map<string, Lesson>;
  };
};
const store = (g.__memoryRepo ??= {
  onboarding: new Map(),
  plans: new Map(),
  roadmaps: new Map(),
  legacyRoadmaps: new Map(),
  legacyLessons: new Map(),
});
// A store created by an older module version may lack newer maps.
store.roadmaps ??= new Map();
store.legacyRoadmaps ??= new Map();
store.legacyLessons ??= new Map();

const emptyState = (): OnboardingState => ({
  step: "questionnaire",
  profile: {},
  draftGraph: null,
  activeRoadmapId: null,
  messages: [],
});

export function mergeProfile(base: OnboardingProfile, patch: OnboardingProfile): OnboardingProfile {
  return {
    ...base,
    ...patch,
    preferences: { ...base.preferences, ...patch.preferences },
    availability: { ...base.availability, ...patch.availability },
  };
}

export const memoryOnboardingRepo: OnboardingRepo = {
  async get(userId) {
    return structuredClone(store.onboarding.get(userId) ?? emptyState());
  },
  async update(userId, patch: OnboardingPatch) {
    const current = store.onboarding.get(userId) ?? emptyState();
    const { profile, ...rest } = patch;
    const next: OnboardingState = {
      ...current,
      ...rest,
      profile: profile ? mergeProfile(current.profile, profile) : current.profile,
    };
    store.onboarding.set(userId, structuredClone(next));
    return structuredClone(next);
  },
};

export const memoryPlanRepo: PlanRepo = {
  async create(userId, plan) {
    const now = new Date().toISOString();
    const created: StudyPlan = {
      ...structuredClone(plan),
      id: crypto.randomUUID(),
      userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    store.plans.set(created.id, created);
    return structuredClone(created);
  },
  async get(planId, userId) {
    const plan = store.plans.get(planId);
    return plan && plan.userId === userId ? structuredClone(plan) : null;
  },
  async getActive(userId) {
    let latest: StudyPlan | null = null;
    for (const plan of store.plans.values()) {
      if (plan.userId === userId && (!latest || plan.createdAt >= latest.createdAt)) latest = plan;
    }
    return latest ? structuredClone(latest) : null;
  },
  async update(planId, userId, patch) {
    const plan = store.plans.get(planId);
    if (!plan || plan.userId !== userId) throw new Error(`Plan ${planId} not found`);
    const next: StudyPlan = {
      ...plan,
      ...structuredClone(patch),
      version: plan.version + 1,
      updatedAt: new Date().toISOString(),
    };
    store.plans.set(planId, next);
    return structuredClone(next);
  },
};

export const memoryRoadmapRepo: RoadmapRepo = {
  async list(userId) {
    return [...store.roadmaps.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(({ id, title, goal, createdAt, updatedAt }) => ({ id, title, goal, createdAt, updatedAt }));
  },
  async get(id, userId) {
    const record = store.roadmaps.get(id);
    return record && record.userId === userId ? structuredClone(record) : null;
  },
  async create(userId, roadmap) {
    const now = new Date().toISOString();
    const created: RoadmapRecord = {
      ...structuredClone(roadmap),
      id: crypto.randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
    };
    store.roadmaps.set(created.id, created);
    return structuredClone(created);
  },
  async update(id, userId, patch) {
    const record = store.roadmaps.get(id);
    if (!record || record.userId !== userId) return null;
    const next: RoadmapRecord = { ...record, ...structuredClone(patch), updatedAt: new Date().toISOString() };
    store.roadmaps.set(id, next);
    return structuredClone(next);
  },
};

const lessonTag = (roadmapId: string, key: string) => `${roadmapId}:${key}`;

export const memoryLegacyRoadmapRepo: LegacyRoadmapRepo = {
  async list(userId) {
    const lessonsWritten = new Map<string, number>();
    for (const tag of store.legacyLessons.keys()) {
      const id = tag.slice(0, tag.indexOf(":"));
      lessonsWritten.set(id, (lessonsWritten.get(id) ?? 0) + 1);
    }
    return [...store.legacyRoadmaps.values()]
      .filter((r) => r.userId === userId && r.complete && r.map.stages.length > 0)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((r) => ({
        id: r.id,
        topic: r.topic,
        title: r.map.topic || r.topic,
        instruction: r.instruction,
        blocks: countBlocks(r.map),
        lessonsWritten: lessonsWritten.get(r.id) ?? 0,
        createdAt: r.createdAt,
      }));
  },
  async get(id, userId) {
    const record = store.legacyRoadmaps.get(id);
    return record && record.userId === userId ? structuredClone(record) : null;
  },
  async create(userId, roadmap) {
    const now = new Date().toISOString();
    const created: LegacyRoadmapRecord = {
      ...structuredClone(roadmap),
      id: crypto.randomUUID(),
      userId,
      complete: roadmap.complete ?? false,
      error: null,
      model: null,
      generationMs: null,
      createdAt: now,
      updatedAt: now,
    };
    store.legacyRoadmaps.set(created.id, created);
    return structuredClone(created);
  },
  async update(id, userId, patch) {
    const record = store.legacyRoadmaps.get(id);
    if (!record || record.userId !== userId) return null;
    const next: LegacyRoadmapRecord = { ...record, ...structuredClone(patch), updatedAt: new Date().toISOString() };
    store.legacyRoadmaps.set(id, next);
    return structuredClone(next);
  },
  async delete(id, userId) {
    const record = store.legacyRoadmaps.get(id);
    if (!record || record.userId !== userId) return;
    store.legacyRoadmaps.delete(id);
    for (const tag of [...store.legacyLessons.keys()]) if (tag.startsWith(`${id}:`)) store.legacyLessons.delete(tag);
  },
  async lessonKeys(id, userId) {
    if (!(await this.get(id, userId))) return [];
    const prefix = `${id}:`;
    return [...store.legacyLessons.keys()].filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length));
  },
  async getLesson(id, userId, key) {
    if (!(await this.get(id, userId))) return null;
    const lesson = store.legacyLessons.get(lessonTag(id, key));
    return lesson ? structuredClone(lesson) : null;
  },
  async saveLesson(id, userId, key, lesson) {
    if (!(await this.get(id, userId))) return;
    store.legacyLessons.set(lessonTag(id, key), structuredClone(lesson));
  },
  async copyLessons(fromId, toId, userId, keys) {
    if (!(await this.get(fromId, userId)) || !(await this.get(toId, userId))) return;
    for (const key of keys) {
      const lesson = store.legacyLessons.get(lessonTag(fromId, key));
      if (lesson && !store.legacyLessons.has(lessonTag(toId, key))) store.legacyLessons.set(lessonTag(toId, key), structuredClone(lesson));
    }
  },
};
