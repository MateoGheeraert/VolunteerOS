-- Task labels become the event's labels, shared by tasks and budget entries. Renames keep the data.
ALTER TYPE "public"."task_label_color" RENAME TO "label_color";--> statement-breakpoint
ALTER TABLE "task_label" RENAME TO "label";--> statement-breakpoint
ALTER INDEX "task_label_event_name_uidx" RENAME TO "label_event_name_uidx";--> statement-breakpoint
ALTER TABLE "label" RENAME CONSTRAINT "task_label_pkey" TO "label_pkey";--> statement-breakpoint
ALTER TABLE "label" RENAME CONSTRAINT "task_label_event_id_event_id_fk" TO "label_event_id_event_id_fk";--> statement-breakpoint
ALTER TABLE "task_label_link" RENAME CONSTRAINT "task_label_link_label_id_task_label_id_fk" TO "task_label_link_label_id_label_id_fk";--> statement-breakpoint
UPDATE "activity_log" SET "entity_type" = 'label' WHERE "entity_type" = 'task_label';
