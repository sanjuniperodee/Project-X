CREATE TABLE "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deadline" date;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_notes_project_idx" ON "project_notes" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_deadline_idx" ON "projects" USING btree ("deadline");--> statement-breakpoint
-- Backfill: until now only Cover Me asked for the gift date (hero.eventDate). New answers set the deadline in the service.
UPDATE "projects" SET "deadline" = ("answers"->'hero'->>'eventDate')::date
WHERE "product_id" = 'glossy' AND "answers"->'hero'->>'eventDate' ~ '^\d{4}-\d{2}-\d{2}$';
