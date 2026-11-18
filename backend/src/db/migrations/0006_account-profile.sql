CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"street" text,
	"house_number" text,
	"box" text,
	"postal_code" text,
	"city" text,
	"country" text,
	"birth_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_address_complete" CHECK (("user_profile"."street" is null and "user_profile"."house_number" is null and "user_profile"."box" is null
        and "user_profile"."postal_code" is null and "user_profile"."city" is null and "user_profile"."country" is null)
      or ("user_profile"."street" is not null and "user_profile"."house_number" is not null
        and "user_profile"."postal_code" is not null and "user_profile"."city" is not null and "user_profile"."country" is not null))
);
--> statement-breakpoint
ALTER TABLE "activity_log" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;