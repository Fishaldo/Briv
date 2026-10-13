CREATE TYPE "public"."connection_provider" AS ENUM('apple_wallet', 'partner', 'upload');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('location', 'precise_location', 'email_access', 'bank_connection', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."payday_rule" AS ENUM('none', 'day_of_month', 'last_working_day', 'last_friday');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('bank', 'receipt', 'statement', 'message', 'voice', 'email', 'typed');--> statement-breakpoint
CREATE TYPE "public"."saving_kind" AS ENUM('offer', 'switch', 'budget');--> statement-breakpoint
CREATE TABLE "ai_use" (
	"person_id" uuid NOT NULL,
	"month" date NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_use_person_id_month_pk" PRIMARY KEY("person_id","month")
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_users_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"never_cut" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" "connection_provider" NOT NULL,
	"bank_name" text,
	"account_type" text,
	"label" text,
	"last_synced_at" timestamp with time zone,
	"consent_ends_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"push_token" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "income_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"take_home" bigint,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "monthly_totals" (
	"person_id" uuid NOT NULL,
	"month" date NOT NULL,
	"category" text NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"total" bigint NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "monthly_totals_person_id_month_category_currency_pk" PRIMARY KEY("person_id","month","category","currency")
);
--> statement-breakpoint
CREATE TABLE "offer_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"offer_id" uuid,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"shop_id" uuid,
	"shop_name" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"price" bigint,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"code" text,
	"ends_on" date,
	"small_print" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"towns" text[] DEFAULT '{}'::text[] NOT NULL,
	"country" char(2) DEFAULT 'GB' NOT NULL,
	"live" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "payee_fixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"statement_key" text NOT NULL,
	"shop_name" text NOT NULL,
	"category" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" text,
	"quantity" numeric(10, 3),
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"category" text,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"connection_id" uuid,
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"spent_on" date NOT NULL,
	"shop_id" uuid,
	"shop_name" text,
	"category" text NOT NULL,
	"kind" text,
	"source" "payment_source" NOT NULL,
	"counts_as_spending" boolean DEFAULT true NOT NULL,
	"to_person" boolean DEFAULT false NOT NULL,
	"statement_sealed" text,
	"has_receipt" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"town" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_key" text NOT NULL,
	"town" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"product" text NOT NULL,
	"size_value" numeric(10, 3),
	"size_unit" text,
	"price" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"per_100" bigint,
	"url" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" char(2) DEFAULT 'GB' NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"home_town" text,
	"payday_rule" "payday_rule" DEFAULT 'none' NOT NULL,
	"payday_day" smallint,
	"usual_take_home" bigint,
	"precise_location" boolean DEFAULT false NOT NULL,
	"location_asked_at" timestamp with time zone,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"payment_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '60 days' NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regular_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"shop_id" uuid,
	"category" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"every" text NOT NULL,
	"every_count" smallint DEFAULT 1 NOT NULL,
	"next_on" date,
	"remind" boolean DEFAULT true NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"trial_ends_on" date,
	"provider" text,
	"contract_ends_on" date,
	"price_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"regular_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "saving_kind" NOT NULL,
	"title" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"offer_id" uuid,
	"payment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"saved_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	"weekly_day" smallint,
	"own_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"own_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sells" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_chain" boolean DEFAULT true NOT NULL,
	"area" text,
	"website" text,
	"loyalty" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "watch_hits" (
	"watch_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_hits_watch_id_offer_id_pk" PRIMARY KEY("watch_id","offer_id")
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"what" text NOT NULL,
	"price_to_beat" bigint,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"town" text,
	"status" text DEFAULT 'watching' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_use" ADD CONSTRAINT "ai_use_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_passkeys" ADD CONSTRAINT "auth_passkeys_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_periods" ADD CONSTRAINT "income_periods_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_totals" ADD CONSTRAINT "monthly_totals_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_clicks" ADD CONSTRAINT "offer_clicks_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_clicks" ADD CONSTRAINT "offer_clicks_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_fixes" ADD CONSTRAINT "payee_fixes_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_payments" ADD CONSTRAINT "regular_payments_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_payments" ADD CONSTRAINT "regular_payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_regular_id_regular_payments_id_fk" FOREIGN KEY ("regular_id") REFERENCES "public"."regular_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings" ADD CONSTRAINT "savings_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings" ADD CONSTRAINT "savings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_hits" ADD CONSTRAINT "watch_hits_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_hits" ADD CONSTRAINT "watch_hits_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_passkeys_user_idx" ON "auth_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_passkeys_credential_idx" ON "auth_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "budgets_person_period_idx" ON "budgets" USING btree ("person_id","period_start");--> statement-breakpoint
CREATE INDEX "connections_person_idx" ON "connections" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "consents_person_kind_idx" ON "consents" USING btree ("person_id","kind","at");--> statement-breakpoint
CREATE INDEX "devices_person_idx" ON "devices" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "income_periods_person_start_idx" ON "income_periods" USING btree ("person_id","starts_on");--> statement-breakpoint
CREATE INDEX "offer_clicks_offer_idx" ON "offer_clicks" USING btree ("offer_id","clicked_at");--> statement-breakpoint
CREATE INDEX "offers_shop_idx" ON "offers" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "offers_live_seen_idx" ON "offers" USING btree ("live","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payee_fixes_person_key_idx" ON "payee_fixes" USING btree ("person_id","statement_key");--> statement-breakpoint
CREATE INDEX "payment_items_payment_idx" ON "payment_items" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_items_person_idx" ON "payment_items" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "payments_person_day_idx" ON "payments" USING btree ("person_id","spent_on");--> statement-breakpoint
CREATE INDEX "payments_person_amount_day_idx" ON "payments" USING btree ("person_id","amount","spent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "places_person_town_idx" ON "places" USING btree ("person_id",lower("town"));--> statement-breakpoint
CREATE UNIQUE INDEX "plan_results_query_town_day_idx" ON "plan_results" USING btree ("query_key","town","day");--> statement-breakpoint
CREATE INDEX "prices_shop_product_idx" ON "prices" USING btree ("shop_id","product");--> statement-breakpoint
CREATE INDEX "questions_person_open_idx" ON "questions" USING btree ("person_id","answered_at");--> statement-breakpoint
CREATE INDEX "regular_payments_person_idx" ON "regular_payments" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_sent_regular_due_idx" ON "reminders_sent" USING btree ("regular_id","due_on");--> statement-breakpoint
CREATE INDEX "savings_person_day_idx" ON "savings" USING btree ("person_id","saved_on");--> statement-breakpoint
CREATE INDEX "watches_person_idx" ON "watches" USING btree ("person_id");