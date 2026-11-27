CREATE TABLE "layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"pdf_url" text NOT NULL,
	"pages" jsonb NOT NULL,
	"template" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "design_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "revisions_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layouts_project_version_idx" ON "layouts" USING btree ("project_id","version");