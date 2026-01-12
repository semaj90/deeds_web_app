DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE "user_role" AS ENUM ('prosecutor', 'detective', 'admin', 'analyst', 'paralegal');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"hashed_password" varchar(255) NOT NULL,
	"name" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"role" "user_role" DEFAULT 'prosecutor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- Try to add constraint if chat_messages exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
        ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_user_id_users_id_fk";
        ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END$$;
