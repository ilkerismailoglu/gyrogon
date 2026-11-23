ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_frame" varchar(32) DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "avatar_url" SET DEFAULT 'preset:pilot';--> statement-breakpoint
UPDATE "users" SET "avatar_url" = 'preset:pilot' WHERE "avatar_url" IS NULL;
