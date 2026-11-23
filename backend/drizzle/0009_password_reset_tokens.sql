CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "email" varchar(255) NOT NULL,
  "code_hash" varchar(128) NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens" ("email");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");
