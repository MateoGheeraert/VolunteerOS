CREATE TYPE "public"."promotion_audience" AS ENUM('children', 'teens', 'young_adults', 'students', 'young_families', 'families', 'adults', 'seniors', 'neighbours', 'associations', 'music_lovers', 'culture_lovers', 'sporty');--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'promotion_plan';--> statement-breakpoint
ALTER TYPE "public"."ai_suggestion_kind" ADD VALUE 'promo_action';--> statement-breakpoint
CREATE TABLE "event_audience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"audiences" "promotion_audience"[] DEFAULT '{}' NOT NULL,
	"description" text,
	"age_min" integer,
	"age_max" integer,
	"region" text,
	"entry_price_cents" integer,
	"pitch" text,
	"promotion_budget_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_audience_age_min_range" CHECK ("event_audience"."age_min" between 0 and 120),
	CONSTRAINT "event_audience_age_max_range" CHECK ("event_audience"."age_max" between 0 and 120),
	CONSTRAINT "event_audience_age_order" CHECK ("event_audience"."age_min" <= "event_audience"."age_max"),
	CONSTRAINT "event_audience_entry_price_range" CHECK ("event_audience"."entry_price_cents" between 0 and 999999999),
	CONSTRAINT "event_audience_promotion_budget_range" CHECK ("event_audience"."promotion_budget_cents" between 0 and 999999999)
);
--> statement-breakpoint
ALTER TABLE "ai_run" ADD COLUMN "instruction" text;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_audience_event_uidx" ON "event_audience" USING btree ("event_id");