CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "reminders_sent_regular_due_idx";--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD COLUMN "step" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_sent_regular_due_step_idx" ON "reminders_sent" USING btree ("regular_id","due_on","step");