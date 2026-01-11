-- Migration: create storage_files and storage_audits tables -- Generated from schema.ts (simple CREATE TABLE
statements) CREATE TABLE IF NOT EXISTS storage_files ( id SERIAL PRIMARY KEY, key TEXT NOT NULL, original_name TEXT NOT
NULL, bucket TEXT NOT NULL, user_id TEXT NOT NULL, size TEXT NOT NULL, mime TEXT NOT NULL, deleted BOOLEAN DEFAULT FALSE
NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL ); CREATE TABLE IF NOT EXISTS storage_audits ( id
SERIAL PRIMARY KEY, action TEXT NOT NULL, user_id TEXT NOT NULL, target TEXT NOT NULL, bucket TEXT NOT NULL, success
BOOLEAN NOT NULL, metadata JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL );
