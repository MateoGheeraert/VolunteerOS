CREATE TYPE "public"."organization_category" AS ENUM('youth_movement', 'sports_club', 'culture', 'school', 'neighbourhood', 'charity', 'student_association', 'religious', 'other');--> statement-breakpoint
CREATE TYPE "public"."organization_legal_form" AS ENUM('de_facto_association', 'npo', 'international_npo', 'foundation', 'company', 'other');--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "category" "organization_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "legal_form" "organization_legal_form";--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "founding_year" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "enterprise_number" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "peppol_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "insurer_name" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "insurance_policy_number" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "house_number" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "box" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "country" text DEFAULT 'BE' NOT NULL;