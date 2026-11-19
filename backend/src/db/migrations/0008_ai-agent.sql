CREATE TYPE "public"."ai_feature" AS ENUM('task_suggestions');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_source" AS ENUM('organizer_answer', 'inference');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_kind" AS ENUM('task_suggestion', 'question', 'update_event');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'dismissed_stale');--> statement-breakpoint
CREATE TYPE "public"."ai_trigger" AS ENUM('on_demand', 'event_created', 'question_answered');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_outcome" AS ENUM('success', 'invalid_output', 'error', 'timeout', 'cap_reached');--> statement-breakpoint
CREATE TABLE "ai_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid,
	"content" text NOT NULL,
	"source" "ai_memory_source" NOT NULL,
	"confidence" "ai_memory_confidence" NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"run_id" uuid,
	"suggestion_id" uuid,
	"copied_from_id" uuid,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"trigger" "ai_trigger" NOT NULL,
	"status" "ai_run_status" DEFAULT 'queued' NOT NULL,
	"requested_by_user_id" text,
	"prompt_version" text,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "ai_suggestion_kind" NOT NULL,
	"dedup_key" text NOT NULL,
	"status" "ai_suggestion_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" jsonb,
	"seen_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" uuid,
	"feature" "ai_feature" NOT NULL,
	"trigger" "ai_trigger" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"outcome" "ai_usage_outcome" NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_millicents" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_attempt_non_negative" CHECK ("ai_usage"."attempt" >= 0)
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_suggestion_id_ai_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."ai_suggestion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_copied_from_id_ai_memory_id_fk" FOREIGN KEY ("copied_from_id") REFERENCES "public"."ai_memory"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_superseded_by_id_ai_memory_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."ai_memory"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_memory_organization_idx" ON "ai_memory" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_memory_event_idx" ON "ai_memory" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ai_run_event_created_idx" ON "ai_run" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestion_event_dedup_uidx" ON "ai_suggestion" USING btree ("event_id","dedup_key");--> statement-breakpoint
CREATE INDEX "ai_suggestion_event_status_idx" ON "ai_suggestion" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ai_usage_organization_created_idx" ON "ai_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_source_pair" CHECK (("activity_log"."source_type" is null) = ("activity_log"."source_id" is null));