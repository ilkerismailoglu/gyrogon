CREATE TABLE IF NOT EXISTS "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_token" varchar(64) NOT NULL,
	"user_id" uuid,
	"device_id" varchar(128),
	"visitor_hash" varchar(64) NOT NULL,
	"is_returning" boolean DEFAULT false NOT NULL,
	"landing_path" varchar(255) DEFAULT '/' NOT NULL,
	"referrer_url" varchar(500),
	"referrer_host" varchar(128) DEFAULT 'direct' NOT NULL,
	"source_category" varchar(32) DEFAULT 'direct' NOT NULL,
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(120),
	"country_code" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
	"region" varchar(120),
	"city" varchar(120),
	"continent" varchar(16),
	"timezone" varchar(64),
	"language" varchar(32),
	"device_type" varchar(24) DEFAULT 'desktop' NOT NULL,
	"os_name" varchar(48) DEFAULT 'Diğer' NOT NULL,
	"os_version" varchar(32),
	"browser_name" varchar(48) DEFAULT 'Diğer' NOT NULL,
	"browser_version" varchar(32),
	"app_mode" varchar(24) DEFAULT 'browser' NOT NULL,
	"screen_width" integer,
	"screen_height" integer,
	"viewport_width" integer,
	"viewport_height" integer,
	"connection_type" varchar(24),
	"site_duration_sec" integer DEFAULT 0 NOT NULL,
	"play_duration_sec" integer DEFAULT 0 NOT NULL,
	"games_started" integer DEFAULT 0 NOT NULL,
	"games_completed" integer DEFAULT 0 NOT NULL,
	"best_score" integer DEFAULT 0 NOT NULL,
	"last_mode" varchar(16),
	"last_sides" integer,
	"last_layout" varchar(16),
	"is_playing_now" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_visits_visit_token_unique" UNIQUE("visit_token")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_visits_user_id_users_id_fk') THEN
    ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_visits_started_idx" ON "site_visits" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_visits_last_seen_idx" ON "site_visits" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_visits_user_idx" ON "site_visits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_visits_geo_idx" ON "site_visits" USING btree ("country_code","city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_visits_visitor_idx" ON "site_visits" USING btree ("visitor_hash");