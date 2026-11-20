CREATE TABLE "daily_seeds" (
	"date" varchar(10) PRIMARY KEY NOT NULL,
	"seed" varchar(128) NOT NULL,
	"target_bronze" integer DEFAULT 500 NOT NULL,
	"target_silver" integer DEFAULT 1500 NOT NULL,
	"target_gold" integer DEFAULT 3000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"mode" varchar(16) DEFAULT 'classic' NOT NULL,
	"seed" varchar(128) NOT NULL,
	"signature" varchar(128) NOT NULL,
	"player_name" varchar(64) DEFAULT 'HexaPlayer' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"final_score" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid NOT NULL,
	"player_name" varchar(64) DEFAULT 'HexaPlayer' NOT NULL,
	"mode" varchar(16) NOT NULL,
	"score" integer NOT NULL,
	"max_combo" integer DEFAULT 1 NOT NULL,
	"blocks_cleared" integer DEFAULT 0 NOT NULL,
	"coins_earned" integer DEFAULT 0 NOT NULL,
	"move_hash" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"category" varchar(32) DEFAULT 'theme' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_code" varchar(64) NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_date" varchar(10) NOT NULL,
	"quest_code" varchar(32) NOT NULL,
	"title" varchar(120) NOT NULL,
	"target" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"reward_coins" integer DEFAULT 40 NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_device_id" varchar(128),
	"display_name" varchar(64) DEFAULT 'HexaPlayer' NOT NULL,
	"avatar_url" text,
	"apple_sub" varchar(255),
	"google_sub" varchar(255),
	"facebook_id" varchar(255),
	"hexa_coins" integer DEFAULT 100 NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"last_login_date" varchar(10),
	"last_streak_claim_date" varchar(10),
	"high_score_classic" integer DEFAULT 0 NOT NULL,
	"high_score_daily" integer DEFAULT 0 NOT NULL,
	"equipped_theme" varchar(32) DEFAULT 'cyberpunk' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_guest_device_id_unique" UNIQUE("guest_device_id"),
	CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scores_mode_score_idx" ON "scores" USING btree ("mode","score");--> statement-breakpoint
CREATE INDEX "scores_user_mode_idx" ON "scores" USING btree ("user_id","mode");--> statement-breakpoint
CREATE UNIQUE INDEX "user_inventory_user_item_idx" ON "user_inventory" USING btree ("user_id","item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_quests_user_date_code_idx" ON "user_quests" USING btree ("user_id","quest_date","quest_code");