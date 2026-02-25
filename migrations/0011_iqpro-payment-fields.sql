-- Add IQPro payment processor fields to member, payment_method, transaction, and member_membership tables
ALTER TABLE "member" ADD COLUMN "iqpro_customer_id" text;--> statement-breakpoint
ALTER TABLE "payment_method" ADD COLUMN "iqpro_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "iqpro_transaction_id" text;--> statement-breakpoint
ALTER TABLE "member_membership" ADD COLUMN "iqpro_subscription_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "member_iqpro_customer_idx" ON "member" USING btree ("iqpro_customer_id");
