ALTER TABLE "conversations" ADD COLUMN "follow_ups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_customer_at" timestamp with time zone;