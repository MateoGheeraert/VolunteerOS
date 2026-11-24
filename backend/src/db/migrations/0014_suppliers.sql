CREATE TYPE "public"."supplier_category" AS ENUM('drinks', 'food', 'sound_and_light', 'tents_and_furniture', 'sanitation', 'security', 'printing', 'transport', 'rental', 'other');--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "supplier_category" NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"notes" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "budget_entry" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_organization_name_uidx" ON "supplier" USING btree ("organization_id",lower("name")) WHERE "supplier"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "supplier_organization_id_idx" ON "supplier" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "budget_entry" ADD CONSTRAINT "budget_entry_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_entry_supplier_id_idx" ON "budget_entry" USING btree ("supplier_id");