CREATE TYPE "public"."budget_entry_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TABLE "budget_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" "budget_entry_type" NOT NULL,
	"title" text NOT NULL,
	"estimated_cents" integer,
	"actual_cents" integer,
	"notes" text,
	"task_id" uuid,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "budget_entry_has_amount" CHECK ("budget_entry"."estimated_cents" is not null or "budget_entry"."actual_cents" is not null),
	CONSTRAINT "budget_entry_estimated_range" CHECK ("budget_entry"."estimated_cents" between 0 and 999999999),
	CONSTRAINT "budget_entry_actual_range" CHECK ("budget_entry"."actual_cents" between 0 and 999999999)
);
--> statement-breakpoint
CREATE TABLE "budget_entry_label_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_entry_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_entry_upload" (
	"upload_id" uuid PRIMARY KEY NOT NULL,
	"budget_entry_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_entry" ADD CONSTRAINT "budget_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry" ADD CONSTRAINT "budget_entry_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry" ADD CONSTRAINT "budget_entry_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry_label_link" ADD CONSTRAINT "budget_entry_label_link_budget_entry_id_budget_entry_id_fk" FOREIGN KEY ("budget_entry_id") REFERENCES "public"."budget_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry_label_link" ADD CONSTRAINT "budget_entry_label_link_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry_upload" ADD CONSTRAINT "budget_entry_upload_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entry_upload" ADD CONSTRAINT "budget_entry_upload_budget_entry_id_budget_entry_id_fk" FOREIGN KEY ("budget_entry_id") REFERENCES "public"."budget_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_entry_event_id_idx" ON "budget_entry" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "budget_entry_task_id_idx" ON "budget_entry" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_entry_label_link_entry_label_uidx" ON "budget_entry_label_link" USING btree ("budget_entry_id","label_id") WHERE "budget_entry_label_link"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "budget_entry_label_link_label_id_idx" ON "budget_entry_label_link" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "budget_entry_upload_budget_entry_id_idx" ON "budget_entry_upload" USING btree ("budget_entry_id");