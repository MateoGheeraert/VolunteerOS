CREATE TYPE "public"."volunteer_commitment" AS ENUM('shifts', 'whole_event');--> statement-breakpoint
CREATE TYPE "public"."volunteer_application_source" AS ENUM('public', 'manual');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('proposed', 'confirmed');--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"status" "assignment_status" DEFAULT 'proposed' NOT NULL,
	"assigned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"meeting_point" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "shift_ends_after_starts" CHECK ("shift"."ends_at" > "shift"."starts_at"),
	CONSTRAINT "shift_capacity_positive" CHECK ("shift"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_meeting_point" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "volunteer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "volunteer_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"volunteer_id" uuid NOT NULL,
	"source" "volunteer_application_source" NOT NULL,
	"available_shift_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"whole_event" boolean DEFAULT false NOT NULL,
	"preferred_team_id" uuid,
	"notes" text,
	"consented_at" timestamp with time zone,
	"notified_schedule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "setup_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "teardown_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "volunteer_commitment" "volunteer_commitment" DEFAULT 'shifts' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "shifts_per_volunteer" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "registration_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "registration_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "schedule_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_application_id_volunteer_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."volunteer_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer" ADD CONSTRAINT "volunteer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application" ADD CONSTRAINT "volunteer_application_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application" ADD CONSTRAINT "volunteer_application_volunteer_id_volunteer_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application" ADD CONSTRAINT "volunteer_application_preferred_team_id_team_id_fk" FOREIGN KEY ("preferred_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_application_shift_uidx" ON "assignment" USING btree ("application_id","shift_id") WHERE "assignment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "assignment_shift_id_idx" ON "assignment" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_event_id_idx" ON "shift" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "shift_team_id_idx" ON "shift" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_event_name_uidx" ON "team" USING btree ("event_id",lower("name")) WHERE "team"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_organization_email_uidx" ON "volunteer" USING btree ("organization_id",lower("email")) WHERE "volunteer"."email" is not null and "volunteer"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_application_event_volunteer_uidx" ON "volunteer_application" USING btree ("event_id","volunteer_id") WHERE "volunteer_application"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "volunteer_application_volunteer_id_idx" ON "volunteer_application" USING btree ("volunteer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_public_slug_uidx" ON "event" USING btree ("public_slug");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_setup_before_start" CHECK ("event"."setup_starts_at" < "event"."starts_at");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_teardown_after_end" CHECK ("event"."teardown_ends_at" > "event"."ends_at");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_shifts_per_volunteer_positive" CHECK ("event"."shifts_per_volunteer" >= 1);