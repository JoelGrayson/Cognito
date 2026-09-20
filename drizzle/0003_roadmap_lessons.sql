CREATE TABLE "roadmap_lessons" (
	"roadmap_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"lesson" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_lessons_roadmap_id_node_id_pk" PRIMARY KEY("roadmap_id","node_id"),
	CONSTRAINT "roadmap_lessons_node_id_valid" CHECK ("roadmap_lessons"."node_id" ~ '^[a-z0-9_]{1,60}$'),
	CONSTRAINT "roadmap_lessons_lesson_object" CHECK (jsonb_typeof("roadmap_lessons"."lesson") = 'object')
);
--> statement-breakpoint
ALTER TABLE "roadmap_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roadmap_lessons" ADD CONSTRAINT "roadmap_lessons_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;