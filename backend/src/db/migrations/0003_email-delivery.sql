CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"event_id" uuid,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_delivery_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_delivery_created_idx" ON "email_delivery" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_delivery_organization_created_idx" ON "email_delivery" USING btree ("organization_id","created_at" DESC NULLS LAST);