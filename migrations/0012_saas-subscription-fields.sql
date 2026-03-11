ALTER TABLE "organization" ADD COLUMN "iqpro_customer_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_subscription_plan_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_billing_cycle" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_subscription_status" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_current_period_end" bigint;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "iqpro_payment_method_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "iqpro_customer_id_idx" ON "organization" USING btree ("iqpro_customer_id");
