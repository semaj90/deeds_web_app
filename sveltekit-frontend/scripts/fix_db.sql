DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_role') THEN
        CREATE TYPE "chat_message_role" AS ENUM ('user', 'assistant', 'system');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "chat_id" varchar(255) NOT NULL,
    "user_id" uuid,
    "role" "chat_message_role" NOT NULL,
    "content" text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    "migrated_from" varchar(255),
    "metadata" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
