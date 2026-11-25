CREATE TABLE "mila_hint_dismissal" (
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"hint_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mila_hint_dismissal_user_id_event_id_hint_key_pk" PRIMARY KEY("user_id","event_id","hint_key")
);
--> statement-breakpoint
ALTER TABLE "mila_hint_dismissal" ADD CONSTRAINT "mila_hint_dismissal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mila_hint_dismissal" ADD CONSTRAINT "mila_hint_dismissal_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;