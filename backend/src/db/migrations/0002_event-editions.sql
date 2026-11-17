CREATE TYPE "public"."event_type" AS ENUM('market', 'festival', 'party', 'quiz', 'meal', 'sports', 'camp', 'trip', 'other');--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "event_type" "event_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "previous_edition_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "expected_attendance" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "actual_attendance" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "retrospective" text;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_previous_edition_id_event_id_fk" FOREIGN KEY ("previous_edition_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_previous_edition_uidx" ON "event" USING btree ("previous_edition_id") WHERE "event"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_expected_attendance_non_negative" CHECK ("event"."expected_attendance" >= 0);--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_actual_attendance_non_negative" CHECK ("event"."actual_attendance" >= 0);--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_not_own_previous_edition" CHECK ("event"."previous_edition_id" <> "event"."id");