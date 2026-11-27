CREATE TYPE "public"."planning_rule_kind" AS ENUM('not_team', 'only_team', 'never_together', 'max_shifts', 'not_before', 'not_after', 'prefers_team', 'prefer_together');--> statement-breakpoint
CREATE TYPE "public"."planning_rule_source" AS ENUM('organizer', 'volunteer_note');--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'shift_suggestions';--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'rule_drafting';--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'allocation';--> statement-breakpoint
ALTER TYPE "public"."ai_suggestion_kind" ADD VALUE 'team_suggestion';--> statement-breakpoint
ALTER TYPE "public"."ai_suggestion_kind" ADD VALUE 'shift_change';--> statement-breakpoint
ALTER TYPE "public"."ai_suggestion_kind" ADD VALUE 'planning_rule';--> statement-breakpoint
ALTER TYPE "public"."ai_suggestion_kind" ADD VALUE 'allocation';--> statement-breakpoint
CREATE TABLE "planning_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid,
	"kind" "planning_rule_kind" NOT NULL,
	"volunteer_id" uuid NOT NULL,
	"other_volunteer_id" uuid,
	"team_name" text,
	"max_shifts" integer,
	"time" text,
	"source" "planning_rule_source" NOT NULL,
	"copied_from_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "planning_rule_fields" CHECK (case "planning_rule"."kind"
        when 'not_team' then "planning_rule"."team_name" is not null and "planning_rule"."other_volunteer_id" is null and "planning_rule"."max_shifts" is null and "planning_rule"."time" is null
        when 'only_team' then "planning_rule"."team_name" is not null and "planning_rule"."other_volunteer_id" is null and "planning_rule"."max_shifts" is null and "planning_rule"."time" is null
        when 'prefers_team' then "planning_rule"."team_name" is not null and "planning_rule"."other_volunteer_id" is null and "planning_rule"."max_shifts" is null and "planning_rule"."time" is null
        when 'never_together' then "planning_rule"."other_volunteer_id" is not null and "planning_rule"."team_name" is null and "planning_rule"."max_shifts" is null and "planning_rule"."time" is null
        when 'prefer_together' then "planning_rule"."other_volunteer_id" is not null and "planning_rule"."team_name" is null and "planning_rule"."max_shifts" is null and "planning_rule"."time" is null
        when 'max_shifts' then "planning_rule"."max_shifts" is not null and "planning_rule"."max_shifts" >= 0 and "planning_rule"."team_name" is null and "planning_rule"."other_volunteer_id" is null and "planning_rule"."time" is null
        else "planning_rule"."time" is not null and "planning_rule"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "planning_rule"."team_name" is null and "planning_rule"."other_volunteer_id" is null and "planning_rule"."max_shifts" is null
      end),
	CONSTRAINT "planning_rule_other_person" CHECK ("planning_rule"."other_volunteer_id" <> "planning_rule"."volunteer_id")
);
--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_volunteer_id_volunteer_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_other_volunteer_id_volunteer_id_fk" FOREIGN KEY ("other_volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_copied_from_id_planning_rule_id_fk" FOREIGN KEY ("copied_from_id") REFERENCES "public"."planning_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rule" ADD CONSTRAINT "planning_rule_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_rule_organization_idx" ON "planning_rule" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "planning_rule_event_idx" ON "planning_rule" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "planning_rule_volunteer_idx" ON "planning_rule" USING btree ("volunteer_id");