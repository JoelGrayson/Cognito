import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { roadmapLessons, roadmaps } from "@/db/schema";
import { countModules } from "@/lib/modules";
import type { RoadmapRecord, RoadmapRepo } from "./types";

type Row = typeof roadmaps.$inferSelect;
const toRecord = (row: Row): RoadmapRecord => ({
  id: row.id,
  userId: row.userId,
  title: row.title,
  goal: row.goal,
  graph: row.graph,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const owned = (id: string, userId: string) => and(eq(roadmaps.id, id), eq(roadmaps.userId, userId));

export const drizzleRoadmapRepo: RoadmapRepo = {
  async list(userId) {
    const db = getDb();
    const rows = await db
      .select({
        id: roadmaps.id,
        title: roadmaps.title,
        goal: roadmaps.goal,
        graph: roadmaps.graph,
        createdAt: roadmaps.createdAt,
        updatedAt: roadmaps.updatedAt,
        lessonsWritten: db.$count(roadmapLessons, eq(roadmapLessons.roadmapId, roadmaps.id)),
      })
      .from(roadmaps)
      .where(eq(roadmaps.userId, userId))
      .orderBy(desc(roadmaps.createdAt));
    return rows.map(({ graph, lessonsWritten, ...row }) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      modules: countModules(graph),
      lessonsWritten,
    }));
  },
  async get(id, userId) {
    const [row] = await getDb().select().from(roadmaps).where(owned(id, userId));
    return row ? toRecord(row) : null;
  },
  async create(userId, roadmap) {
    const [row] = await getDb()
      .insert(roadmaps)
      .values({ userId, title: roadmap.title, goal: roadmap.goal, graph: roadmap.graph })
      .returning();
    return toRecord(row);
  },
  async update(id, userId, patch) {
    const [row] = await getDb()
      .update(roadmaps)
      .set({ ...patch, updatedAt: new Date() })
      .where(owned(id, userId))
      .returning();
    return row ? toRecord(row) : null;
  },
  async delete(id, userId) {
    await getDb().delete(roadmaps).where(owned(id, userId));
  },
  async lessonNodeIds(id, userId) {
    const rows = await getDb()
      .select({ nodeId: roadmapLessons.nodeId })
      .from(roadmapLessons)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapLessons.roadmapId))
      .where(owned(id, userId));
    return rows.map((r) => r.nodeId);
  },
  async getLesson(id, userId, nodeId) {
    const [row] = await getDb()
      .select({ lesson: roadmapLessons.lesson })
      .from(roadmapLessons)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapLessons.roadmapId))
      .where(and(owned(id, userId), eq(roadmapLessons.nodeId, nodeId)));
    return row?.lesson ?? null;
  },
  async saveLesson(id, userId, nodeId, lesson) {
    const db = getDb();
    const [owner] = await db.select({ id: roadmaps.id }).from(roadmaps).where(owned(id, userId));
    if (!owner) throw new Error("Roadmap not found.");
    await db
      .insert(roadmapLessons)
      .values({ roadmapId: id, nodeId, lesson })
      .onConflictDoUpdate({
        target: [roadmapLessons.roadmapId, roadmapLessons.nodeId],
        set: { lesson, updatedAt: sql`now()` },
      });
  },
};
