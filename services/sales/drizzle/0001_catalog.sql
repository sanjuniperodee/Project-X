CREATE TABLE "catalog_photos" (
	"product_id" text PRIMARY KEY NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"synced_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_products" (
	"id" text PRIMARY KEY NOT NULL,
	"retailer_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer,
	"url" text DEFAULT '' NOT NULL,
	"review" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
