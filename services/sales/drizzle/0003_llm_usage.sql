CREATE TABLE "llm_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"service" text NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"conversation_id" uuid,
	"project_id" text
);
--> statement-breakpoint
CREATE INDEX "llm_usage_at_idx" ON "llm_usage" USING btree ("at");