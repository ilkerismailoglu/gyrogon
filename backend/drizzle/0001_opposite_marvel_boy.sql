CREATE TABLE "ad_rewards" (
	"transaction_id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_item" varchar(64) NOT NULL,
	"reward_amount" integer DEFAULT 50 NOT NULL,
	"key_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;