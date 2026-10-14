ALTER TABLE "regular_payments" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "regular_payments_person_key_idx" ON "regular_payments" USING btree ("person_id","key");