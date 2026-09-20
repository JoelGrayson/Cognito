CREATE TABLE "legacy_lessons" (
	"roadmap_id" uuid NOT NULL,
	"key" text NOT NULL,
	"lesson" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_lessons_roadmap_id_key_pk" PRIMARY KEY("roadmap_id","key"),
	CONSTRAINT "legacy_lessons_key_nonempty" CHECK (length(btrim("legacy_lessons"."key")) > 0),
	CONSTRAINT "legacy_lessons_lesson_object" CHECK (jsonb_typeof("legacy_lessons"."lesson") = 'object')
);
--> statement-breakpoint
ALTER TABLE "legacy_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legacy_roadmaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"details" text,
	"provider" text NOT NULL,
	"instruction" text,
	"map" jsonb NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"error" text,
	"model" text,
	"generation_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_roadmaps_map_object" CHECK (jsonb_typeof("legacy_roadmaps"."map") = 'object')
);
--> statement-breakpoint
ALTER TABLE "legacy_roadmaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legacy_lessons" ADD CONSTRAINT "legacy_lessons_roadmap_id_legacy_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."legacy_roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_roadmaps" ADD CONSTRAINT "legacy_roadmaps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_roadmaps_user_created_idx" ON "legacy_roadmaps" USING btree ("user_id","created_at" DESC NULLS LAST);