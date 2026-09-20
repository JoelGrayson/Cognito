import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { legacyLessons, legacyRoadmaps } from "@/db/schema";
import { countBlocks } from "@/lib/roadmap";
import type { LegacyRoadmapRecord, LegacyRoadmapRepo } from "./types";

type Row = typeof legacyRoadmaps.$inferSelect;
const toRecord = (row: Row): LegacyRoadmapRecord => ({
  id: row.id,
  userId: row.userId,
  topic: row.topic,
  details: row.details,
  provider: row.provider,
  instruction: row.instruction,
  map: row.map,
  complete: row.complete,
  error: row.error,
  model: row.model,
  generationMs: row.generationMs,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const owned = (id: string, userId: string) => and(eq(legacyRoadmaps.id, id), eq(legacyRoadmaps.userId, userId));

async function owns(id: string, userId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: legacyRoadmaps.id }).from(legacyRoadmaps).where(owned(id, userId));
  return !!row;
}

export const drizzleLegacyRoadmapRepo: LegacyRoadmapRepo = {
  async list(userId) {
    const lessonsWritten = getDb()
      .select({ roadmapId: legacyLessons.roadmapId, count: sql<number>`count(*)::int`.as("count") })
      .from(legacyLessons)
      .groupBy(legacyLessons.roadmapId)
      .as("lessons_written");
    const rows = await getDb()
      .select({
        id: legacyRoadmaps.id,
        topic: legacyRoadmaps.topic,
        instruction: legacyRoadmaps.instruction,
        map: legacyRoadmaps.map,
        createdAt: legacyRoadmaps.createdAt,
        lessonsWritten: sql<number>`coalesce(${lessonsWritten.count}, 0)`,
      })
      .from(legacyRoadmaps)
      .leftJoin(lessonsWritten, eq(lessonsWritten.roadmapId, legacyRoadmaps.id))
      .where(and(eq(legacyRoadmaps.userId, userId), eq(legacyRoadmaps.complete, true)))
      .orderBy(desc(legacyRoadmaps.createdAt));
    return rows
      .filter((row) => row.map.stages.length > 0)
      .map((row) => ({
        id: row.id,
        topic: row.topic,
        title: row.map.topic || row.topic,
        instruction: row.instruction,
        blocks: countBlocks(row.map),
        lessonsWritten: row.lessonsWritten,
        createdAt: row.createdAt.toISOString(),
      }));
  },
  async get(id, userId) {
    const [row] = await getDb().select().from(legacyRoadmaps).where(owned(id, userId));
    return row ? toRecord(row) : null;
  },
  async create(userId, roadmap) {
    const [row] = await getDb().insert(legacyRoadmaps).values({ userId, ...roadmap }).returning();
    return toRecord(row);
  },
  async update(id, userId, patch) {
    const [row] = await getDb()
      .update(legacyRoadmaps)
      .set({ ...patch, updatedAt: new Date() })
      .where(owned(id, userId))
      .returning();
    return row ? toRecord(row) : null;
  },
  async delete(id, userId) {
    await getDb().delete(legacyRoadmaps).where(owned(id, userId));
  },
  async lessonKeys(id, userId) {
    if (!(await owns(id, userId))) return [];
    const rows = await getDb().select({ key: legacyLessons.key }).from(legacyLessons).where(eq(legacyLessons.roadmapId, id));
    return rows.map((row) => row.key);
  },
  async getLesson(id, userId, key) {
    if (!(await owns(id, userId))) return null;
    const [row] = await getDb()
      .select({ lesson: legacyLessons.lesson })
      .from(legacyLessons)
      .where(and(eq(legacyLessons.roadmapId, id), eq(legacyLessons.key, key)));
    return row?.lesson ?? null;
  },
  async saveLesson(id, userId, key, lesson) {
    if (!(await owns(id, userId))) return;
    await getDb()
      .insert(legacyLessons)
      .values({ roadmapId: id, key, lesson })
      .onConflictDoUpdate({ target: [legacyLessons.roadmapId, legacyLessons.key], set: { lesson, updatedAt: new Date() } });
  },
  async copyLessons(fromId, toId, userId, keys) {
    if (keys.length === 0 || !(await owns(fromId, userId)) || !(await owns(toId, userId))) return;
    const rows = await getDb()
      .select({ key: legacyLessons.key, lesson: legacyLessons.lesson })
      .from(legacyLessons)
      .where(and(eq(legacyLessons.roadmapId, fromId), inArray(legacyLessons.key, keys)));
    if (rows.length === 0) return;
    await getDb()
      .insert(legacyLessons)
      .values(rows.map((row) => ({ roadmapId: toId, key: row.key, lesson: row.lesson })))
      .onConflictDoNothing();
  },
};
