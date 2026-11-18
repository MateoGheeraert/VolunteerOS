CREATE TYPE "public"."task_assignment_request_status" AS ENUM('pending', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_label_color" AS ENUM('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"assignee_user_id" text,
	"assignee_name" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "task_single_assignee" CHECK ("task"."assignee_user_id" is null or "task"."assignee_name" is null)
);
--> statement-breakpoint
CREATE TABLE "task_assignment_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "task_assignment_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" "task_label_color" DEFAULT 'gray' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_label_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_request" ADD CONSTRAINT "task_assignment_request_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_request" ADD CONSTRAINT "task_assignment_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_link" ADD CONSTRAINT "task_label_link_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_link" ADD CONSTRAINT "task_label_link_label_id_task_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."task_label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_event_id_idx" ON "task" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "task_assignee_user_id_idx" ON "task" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignment_request_pending_uidx" ON "task_assignment_request" USING btree ("task_id","user_id") WHERE "task_assignment_request"."status" = 'pending' and "task_assignment_request"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_assignment_request_user_id_idx" ON "task_assignment_request" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_label_event_name_uidx" ON "task_label" USING btree ("event_id",lower("name")) WHERE "task_label"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "task_label_link_task_label_uidx" ON "task_label_link" USING btree ("task_id","label_id") WHERE "task_label_link"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_label_link_label_id_idx" ON "task_label_link" USING btree ("label_id");