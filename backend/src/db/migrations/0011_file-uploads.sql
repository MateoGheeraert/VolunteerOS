CREATE TYPE "public"."upload_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "event_upload" (
	"upload_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_upload" (
	"upload_id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "upload_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "event_upload" ADD CONSTRAINT "event_upload_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_upload" ADD CONSTRAINT "event_upload_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_upload" ADD CONSTRAINT "task_upload_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_upload" ADD CONSTRAINT "task_upload_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_upload_event_id_idx" ON "event_upload" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "task_upload_task_id_idx" ON "task_upload" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "upload_organization_live_idx" ON "upload" USING btree ("organization_id") WHERE "upload"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "upload_unpurged_idx" ON "upload" USING btree ("deleted_at","created_at") WHERE "upload"."purged_at" is null;