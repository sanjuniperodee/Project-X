CREATE TABLE "conversation_projects" (
	"project_id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"edit_key" text NOT NULL,
	"invite_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"phone" text,
	"name" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'bot' NOT NULL,
	"bot_paused_until" timestamp with time zone,
	"handoff_reason" text,
	"pending" boolean DEFAULT false NOT NULL,
	"bot_turns" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author" text NOT NULL,
	"text" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_projects_conversation_idx" ON "conversation_projects" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_chat_idx" ON "conversations" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "conversations_pending_idx" ON "conversations" USING btree ("pending");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_idx" ON "messages" USING btree ("external_id");