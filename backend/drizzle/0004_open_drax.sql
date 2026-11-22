ALTER TABLE "users" ALTER COLUMN "display_name" SET DEFAULT 'GyroPilot';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND (conname = 'users_email_unique' OR conname = 'users_email_key')
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
  END IF;
END $$;