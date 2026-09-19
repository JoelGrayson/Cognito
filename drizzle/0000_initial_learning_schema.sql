CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "node_content" (
	"plan_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_content_plan_id_node_id_kind_pk" PRIMARY KEY("plan_id","node_id","kind"),
	CONSTRAINT "node_content_node_id_valid" CHECK ("node_content"."node_id" ~ '^[a-z0-9_]{1,60}$'),
	CONSTRAINT "node_content_kind_nonempty" CHECK (length(btrim("node_content"."kind")) > 0)
);
--> statement-breakpoint
ALTER TABLE "node_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"step" text DEFAULT 'questionnaire' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_graph" jsonb,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_step_valid" CHECK ("onboarding_sessions"."step" in ('questionnaire', 'workshop', 'generating', 'done')),
	CONSTRAINT "onboarding_profile_object" CHECK (jsonb_typeof("onboarding_sessions"."profile") = 'object'),
	CONSTRAINT "onboarding_graph_object" CHECK ("onboarding_sessions"."draft_graph" is null or jsonb_typeof("onboarding_sessions"."draft_graph") = 'object'),
	CONSTRAINT "onboarding_messages_array" CHECK (jsonb_typeof("onboarding_sessions"."messages") = 'array')
);
--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"profile" jsonb NOT NULL,
	"graph" jsonb NOT NULL,
	"order" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plans_version_positive" CHECK ("study_plans"."version" > 0),
	CONSTRAINT "study_plans_profile_object" CHECK (jsonb_typeof("study_plans"."profile") = 'object'),
	CONSTRAINT "study_plans_graph_object" CHECK (jsonb_typeof("study_plans"."graph") = 'object'),
	CONSTRAINT "study_plans_order_array" CHECK (jsonb_typeof("study_plans"."order") = 'array'),
	CONSTRAINT "study_plans_schedule_array" CHECK (jsonb_typeof("study_plans"."schedule") = 'array')
);
--> statement-breakpoint
ALTER TABLE "study_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "topic_progress" (
	"plan_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"progress" text DEFAULT 'todo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_progress_plan_id_node_id_pk" PRIMARY KEY("plan_id","node_id"),
	CONSTRAINT "topic_progress_node_id_valid" CHECK ("topic_progress"."node_id" ~ '^[a-z0-9_]{1,60}$'),
	CONSTRAINT "topic_progress_value_valid" CHECK ("topic_progress"."progress" in ('todo', 'in_progress', 'done'))
);
--> statement-breakpoint
ALTER TABLE "topic_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_content" ADD CONSTRAINT "node_content_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_plans_user_created_idx" ON "study_plans" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");