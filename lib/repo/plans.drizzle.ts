import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { studyPlans } from "@/db/schema";
import type { StudyPlan } from "@/types/learning";
import type { PlanRepo } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = typeof studyPlans.$inferSelect;
const toPlan = (row: Row): StudyPlan => ({
  id: row.id,
  userId: row.userId,
  version: row.version,
  title: row.title,
  profile: row.profile,
  graph: row.graph,
  order: row.order,
  schedule: row.schedule,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const drizzlePlanRepo: PlanRepo = {
  async create(userId, plan) {
    const [row] = await getDb().insert(studyPlans).values({ userId, ...plan }).returning();
    return toPlan(row);
  },

  async get(planId, userId) {
    if (!UUID.test(planId)) return null;
    const [row] = await getDb()
      .select()
      .from(studyPlans)
      .where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));
    return row ? toPlan(row) : null;
  },

  async getActive(userId) {
    const [row] = await getDb()
      .select()
      .from(studyPlans)
      .where(eq(studyPlans.userId, userId))
      .orderBy(desc(studyPlans.createdAt), desc(studyPlans.id))
      .limit(1);
    return row ? toPlan(row) : null;
  },

  async update(planId, userId, patch) {
    if (!UUID.test(planId)) throw new Error(`Plan ${planId} not found`);
    const [row] = await getDb()
      .update(studyPlans)
      .set({ ...patch, version: sql`${studyPlans.version} + 1`, updatedAt: new Date() })
      .where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)))
      .returning();
    if (!row) throw new Error(`Plan ${planId} not found`);
    return toPlan(row);
  },
};
