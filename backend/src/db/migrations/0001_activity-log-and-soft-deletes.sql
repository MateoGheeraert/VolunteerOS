CREATE TYPE "public"."activity_actor_type" AS ENUM('user', 'volunteer', 'system', 'ai');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid,
	"actor_type" "activity_actor_type" NOT NULL,
	"actor_id" text,
	"on_behalf_of_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_log_actor_id" CHECK ("activity_log"."actor_type" = 'system' or "activity_log"."actor_id" is not null),
	CONSTRAINT "activity_log_on_behalf_of_ai" CHECK ("activity_log"."on_behalf_of_user_id" is null or "activity_log"."actor_type" = 'ai')
);
--> statement-breakpoint
DROP INDEX "event_member_event_user_uidx";--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_member" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_organization_created_idx" ON "activity_log" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_event_created_idx" ON "activity_log" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_member_event_user_uidx" ON "event_member" USING btree ("event_id","user_id") WHERE "event_member"."deleted_at" is null;