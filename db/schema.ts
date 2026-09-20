import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import type {
  ContentBody, DraftGraph, LearnerProfile, NodeId, OnboardingProfile,
  OnboardingStep, PlanGraph, Progress, ScheduleWeek, WorkshopMessage,
} from "../types/learning";
import type { Lesson } from "../lib/schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true })
  .defaultNow().notNull().$onUpdate(() => new Date());

// Better Auth's standard schema, including the anonymous plugin field.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("session_user_id_idx").on(table.userId)]).enableRLS();

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
]).enableRLS();

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]).enableRLS();

export const onboardingSessions = pgTable("onboarding_sessions", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  step: text("step").$type<OnboardingStep>().default("questionnaire").notNull(),
  profile: jsonb("profile").$type<OnboardingProfile>().default({}).notNull(),
  draftGraph: jsonb("draft_graph").$type<DraftGraph>(),
  /** The past-roadmaps record this draft was resumed from; saves write through to it. */
  activeRoadmapId: uuid("active_roadmap_id").references(() => roadmaps.id, { onDelete: "set null" }),
  messages: jsonb("messages").$type<WorkshopMessage[]>().default([]).notNull(),
  updatedAt: updatedAt(),
}, (table) => [
  check("onboarding_step_valid", sql`${table.step} in ('questionnaire', 'workshop', 'generating', 'done')`),
  check("onboarding_profile_object", sql`jsonb_typeof(${table.profile}) = 'object'`),
  check("onboarding_graph_object", sql`${table.draftGraph} is null or jsonb_typeof(${table.draftGraph}) = 'object'`),
  check("onboarding_messages_array", sql`jsonb_typeof(${table.messages}) = 'array'`),
]).enableRLS();

export const studyPlans = pgTable("study_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  title: text("title").notNull(),
  profile: jsonb("profile").$type<LearnerProfile>().notNull(),
  graph: jsonb("graph").$type<PlanGraph>().notNull(),
  order: jsonb("order").$type<NodeId[]>().notNull(),
  schedule: jsonb("schedule").$type<ScheduleWeek[]>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("study_plans_user_created_idx").on(table.userId, table.createdAt.desc()),
  check("study_plans_version_positive", sql`${table.version} > 0`),
  check("study_plans_profile_object", sql`jsonb_typeof(${table.profile}) = 'object'`),
  check("study_plans_graph_object", sql`jsonb_typeof(${table.graph}) = 'object'`),
  check("study_plans_order_array", sql`jsonb_typeof(${table.order}) = 'array'`),
  check("study_plans_schedule_array", sql`jsonb_typeof(${table.schedule}) = 'array'`),
]).enableRLS();

export const topicProgress = pgTable("topic_progress", {
  planId: uuid("plan_id").notNull().references(() => studyPlans.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  progress: text("progress").$type<Progress>().default("todo").notNull(),
  updatedAt: updatedAt(),
}, (table) => [
  primaryKey({ columns: [table.planId, table.nodeId] }),
  check("topic_progress_node_id_valid", sql`${table.nodeId} ~ '^[a-z0-9_]{1,60}$'`),
  check("topic_progress_value_valid", sql`${table.progress} in ('todo', 'in_progress', 'done')`),
]).enableRLS();

export const nodeContent = pgTable("node_content", {
  planId: uuid("plan_id").notNull().references(() => studyPlans.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  kind: text("kind").notNull(),
  body: jsonb("body").$type<ContentBody>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.planId, table.nodeId, table.kind] }),
  check("node_content_node_id_valid", sql`${table.nodeId} ~ '^[a-z0-9_]{1,60}$'`),
  check("node_content_kind_nonempty", sql`length(btrim(${table.kind})) > 0`),
]).enableRLS();

/** One record per generated draft roadmap — the "past roadmaps" list on onboarding. */
export const roadmaps = pgTable("roadmaps", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  graph: jsonb("graph").$type<DraftGraph>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("roadmaps_user_created_idx").on(table.userId, table.createdAt.desc()),
  check("roadmaps_graph_object", sql`jsonb_typeof(${table.graph}) = 'object'`),
]).enableRLS();

/** One written lesson per roadmap node; the module the learner opens from the graph. */
export const roadmapLessons = pgTable("roadmap_lessons", {
  roadmapId: uuid("roadmap_id").notNull().references(() => roadmaps.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  lesson: jsonb("lesson").$type<Lesson>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  primaryKey({ columns: [table.roadmapId, table.nodeId] }),
  check("roadmap_lessons_node_id_valid", sql`${table.nodeId} ~ '^[a-z0-9_]{1,60}$'`),
  check("roadmap_lessons_lesson_object", sql`jsonb_typeof(${table.lesson}) = 'object'`),
]).enableRLS();

export type StudyPlan = typeof studyPlans.$inferSelect;
export type Roadmap = typeof roadmaps.$inferSelect;
export type NewStudyPlan = typeof studyPlans.$inferInsert;
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type TopicProgress = typeof topicProgress.$inferSelect;
export type NodeContent = typeof nodeContent.$inferSelect;
