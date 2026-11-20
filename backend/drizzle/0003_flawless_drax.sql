ALTER TABLE "game_sessions" ADD COLUMN "sides" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "sides" integer DEFAULT 6 NOT NULL;