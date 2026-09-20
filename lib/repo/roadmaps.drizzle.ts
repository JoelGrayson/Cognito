import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { roadmaps } from "@/db/schema";
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

export const drizzleRoadmapRepo: RoadmapRepo = {
  async list(userId) {
    const rows = await getDb()
      .select({
        id: roadmaps.id,
        title: roadmaps.title,
        goal: roadmaps.goal,
        createdAt: roadmaps.createdAt,
        updatedAt: roadmaps.updatedAt,
      })
      .from(roadmaps)
      .where(eq(roadmaps.userId, userId))
      .orderBy(desc(roadmaps.createdAt));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
  },
  async get(id, userId) {
    const [row] = await getDb()
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId)));
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
      .where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId)))
      .returning();
    return row ? toRecord(row) : null;
  },
};
