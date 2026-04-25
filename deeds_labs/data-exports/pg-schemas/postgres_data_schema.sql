--
-- PostgreSQL database dump
--

\restrict xPslCkYM3E6vJYVcQGwLasaaaD4gNTVoIx3UgWskK6h1sDZx3yMZdbZlU5BL1jI

-- Dumped from database version 17.6 (Debian 17.6-1.pgdg12+1)
-- Dumped by pg_dump version 17.6 (Debian 17.6-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: legal_admin
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO legal_admin;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: activity_status; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.activity_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled',
    'postponed'
);


ALTER TYPE public.activity_status OWNER TO legal_admin;

--
-- Name: case_priority; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.case_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical',
    'urgent'
);


ALTER TYPE public.case_priority OWNER TO legal_admin;

--
-- Name: case_risk_level; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.case_risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical',
    'urgent'
);


ALTER TYPE public.case_risk_level OWNER TO legal_admin;

--
-- Name: case_status; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.case_status AS ENUM (
    'open',
    'in_progress',
    'pending_review',
    'closed',
    'archived'
);


ALTER TYPE public.case_status OWNER TO legal_admin;

--
-- Name: confidentiality_level; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.confidentiality_level AS ENUM (
    'public',
    'standard',
    'confidential',
    'restricted',
    'classified'
);


ALTER TYPE public.confidentiality_level OWNER TO legal_admin;

--
-- Name: document_status; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.document_status AS ENUM (
    'queued',
    'processing',
    'processed',
    'failed',
    'pending_ocr',
    'ocr_completed',
    'pending_embedding',
    'embedding_completed',
    'pending_summary',
    'summary_completed'
);


ALTER TYPE public.document_status OWNER TO legal_admin;

--
-- Name: document_type; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.document_type AS ENUM (
    'case_law',
    'statute',
    'regulation',
    'brief',
    'contract',
    'evidence',
    'report',
    'precedent'
);


ALTER TYPE public.document_type OWNER TO legal_admin;

--
-- Name: evidence_type; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.evidence_type AS ENUM (
    'document',
    'photo',
    'video',
    'audio',
    'physical',
    'digital',
    'witness_statement',
    'forensic'
);


ALTER TYPE public.evidence_type OWNER TO legal_admin;

--
-- Name: report_status; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.report_status AS ENUM (
    'draft',
    'review',
    'approved',
    'published',
    'archived'
);


ALTER TYPE public.report_status OWNER TO legal_admin;

--
-- Name: summary_type; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.summary_type AS ENUM (
    'legal_analysis',
    'executive_summary',
    'key_facts'
);


ALTER TYPE public.summary_type OWNER TO legal_admin;

--
-- Name: threat_level; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.threat_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE public.threat_level OWNER TO legal_admin;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.user_role AS ENUM (
    'prosecutor',
    'detective',
    'admin',
    'analyst',
    'paralegal'
);


ALTER TYPE public.user_role OWNER TO legal_admin;

--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: legal_admin
--

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'verified',
    'rejected',
    'needs_review'
);


ALTER TYPE public.verification_status OWNER TO legal_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: legal_admin
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO legal_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: legal_admin
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO legal_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: legal_admin
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: ai_reports; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.ai_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    created_by integer,
    report_type character varying(100) NOT NULL,
    summary text,
    full_report text,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ai_reports OWNER TO legal_admin;

--
-- Name: attachment_verifications; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.attachment_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attachment_id uuid,
    verified_by integer,
    status public.verification_status,
    verification_date timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


ALTER TABLE public.attachment_verifications OWNER TO legal_admin;

--
-- Name: auto_tags; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.auto_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    entity_type character varying(50) NOT NULL,
    tag character varying(100) NOT NULL,
    confidence real NOT NULL,
    source character varying(100) NOT NULL,
    model character varying(100),
    is_confirmed boolean DEFAULT false NOT NULL,
    confirmed_by integer,
    confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auto_tags OWNER TO legal_admin;

--
-- Name: canvas_annotations; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.canvas_annotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canvas_state_id uuid,
    created_by integer,
    annotation_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


ALTER TABLE public.canvas_annotations OWNER TO legal_admin;

--
-- Name: canvas_autosaves; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.canvas_autosaves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canvas_state_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.canvas_autosaves OWNER TO legal_admin;

--
-- Name: canvas_states; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.canvas_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    user_id integer,
    state_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.canvas_states OWNER TO legal_admin;

--
-- Name: case_activities; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.case_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    assigned_to integer,
    created_by integer,
    activity_type character varying(100),
    description text,
    status public.activity_status,
    due_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.case_activities OWNER TO legal_admin;

--
-- Name: case_embeddings; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.case_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    embedding text NOT NULL,
    model character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.case_embeddings OWNER TO legal_admin;

--
-- Name: case_scores; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.case_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calculated_by integer,
    case_id uuid NOT NULL,
    score numeric(5,2) NOT NULL,
    risk_level public.case_risk_level NOT NULL,
    breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    recommendations jsonb DEFAULT '[]'::jsonb NOT NULL,
    calculated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.case_scores OWNER TO legal_admin;

--
-- Name: cases; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    status text NOT NULL,
    case_number character varying(100),
    jurisdiction character varying(100),
    practice_area character varying(100),
    priority text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    court character varying(200),
    client_name character varying(200),
    opposing_party character varying(200),
    assigned_attorney integer,
    filing_date timestamp with time zone,
    due_date timestamp with time zone,
    closed_date timestamp with time zone,
    qdrant_id uuid,
    qdrant_collection character varying(100)
);


ALTER TABLE public.cases OWNER TO legal_admin;

--
-- Name: chat_embeddings; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.chat_embeddings (
    id integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(384),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.chat_embeddings OWNER TO legal_admin;

--
-- Name: chat_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: legal_admin
--

CREATE SEQUENCE public.chat_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_embeddings_id_seq OWNER TO legal_admin;

--
-- Name: chat_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: legal_admin
--

ALTER SEQUENCE public.chat_embeddings_id_seq OWNED BY public.chat_embeddings.id;


--
-- Name: citations; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.citations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    document_id text,
    citation_text text NOT NULL,
    page_number integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    source_url text,
    confidence real,
    created_by integer
);


ALTER TABLE public.citations OWNER TO legal_admin;

--
-- Name: codemod_memories; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.codemod_memories (
    id uuid NOT NULL,
    error_code text,
    error_key text,
    message text,
    occurrence_count integer,
    priority text,
    framework text,
    source text,
    tags text[],
    content text,
    langextract jsonb,
    embedding public.vector(768),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.codemod_memories OWNER TO legal_admin;

--
-- Name: content_embeddings; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.content_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    embedding text NOT NULL,
    model character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.content_embeddings OWNER TO legal_admin;

--
-- Name: criminals; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.criminals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    middle_name character varying(100),
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    date_of_birth timestamp without time zone,
    place_of_birth character varying(200),
    address text,
    phone character varying(20),
    email character varying(255),
    ssn character varying(11),
    drivers_license character varying(50),
    height integer,
    weight integer,
    eye_color character varying(20),
    hair_color character varying(20),
    distinguishing_marks text,
    photo_url text,
    fingerprints jsonb DEFAULT '{}'::jsonb NOT NULL,
    threat_level public.threat_level DEFAULT 'low'::public.threat_level NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    ai_summary text,
    ai_tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.criminals OWNER TO legal_admin;

--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id text NOT NULL,
    chunk_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    content text NOT NULL
);


ALTER TABLE public.document_chunks OWNER TO legal_admin;

--
-- Name: document_processing; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.document_processing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    status public.document_status DEFAULT 'queued'::public.document_status NOT NULL,
    processor character varying(100),
    metadata jsonb,
    error text,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_processing OWNER TO legal_admin;

--
-- Name: document_summaries; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.document_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    summary_type public.summary_type NOT NULL,
    summary_text text NOT NULL,
    model character varying(100),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_summaries OWNER TO legal_admin;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.documents (
    id text DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    title text NOT NULL,
    file_size bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    content text,
    s3_key text NOT NULL,
    s3_bucket text DEFAULT 'legal-documents'::text NOT NULL,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    status public.document_status DEFAULT 'queued'::public.document_status NOT NULL
);


ALTER TABLE public.documents OWNER TO legal_admin;

--
-- Name: email_verification_codes; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.email_verification_codes (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    code character varying(8) NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.email_verification_codes OWNER TO legal_admin;

--
-- Name: email_verification_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: legal_admin
--

CREATE SEQUENCE public.email_verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_verification_codes_id_seq OWNER TO legal_admin;

--
-- Name: email_verification_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: legal_admin
--

ALTER SEQUENCE public.email_verification_codes_id_seq OWNED BY public.email_verification_codes.id;


--
-- Name: evidence; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    title character varying(255) NOT NULL,
    description text,
    evidence_type public.evidence_type NOT NULL,
    file_url text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    criminal_id uuid,
    file_type character varying(50),
    sub_type character varying(50),
    file_name character varying(255),
    canvas_position jsonb DEFAULT '{}'::jsonb NOT NULL,
    uploaded_by integer,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.evidence OWNER TO legal_admin;

--
-- Name: evidence_vectors; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.evidence_vectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evidence_id uuid NOT NULL,
    vector text NOT NULL,
    model character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.evidence_vectors OWNER TO legal_admin;

--
-- Name: hash_verifications; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.hash_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evidence_id uuid NOT NULL,
    verified_by integer,
    hash_value text NOT NULL,
    algorithm character varying(50) NOT NULL,
    status public.verification_status DEFAULT 'pending'::public.verification_status NOT NULL,
    verification_date timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hash_verifications OWNER TO legal_admin;

--
-- Name: legal_analysis_sessions; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.legal_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    case_id uuid,
    analysis_type character varying(100) NOT NULL,
    input_data jsonb,
    output_summary text,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.legal_analysis_sessions OWNER TO legal_admin;

--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.legal_documents (
    id text NOT NULL,
    title text NOT NULL,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    s3_bucket text DEFAULT 'legal-documents'::text NOT NULL,
    user_id integer,
    evidence_id uuid,
    created_by integer,
    status public.document_status DEFAULT 'queued'::public.document_status NOT NULL,
    content_embedding text,
    qdrant_id uuid,
    qdrant_collection character varying(100),
    last_synced_to_qdrant timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.legal_documents OWNER TO legal_admin;

--
-- Name: legal_precedents; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.legal_precedents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    title character varying(255) NOT NULL,
    summary text NOT NULL,
    citation character varying(255),
    court character varying(200),
    decision_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.legal_precedents OWNER TO legal_admin;

--
-- Name: legal_research; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.legal_research (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    created_by integer NOT NULL,
    query text NOT NULL,
    results jsonb,
    status character varying(50) DEFAULT 'completed'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.legal_research OWNER TO legal_admin;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.password_reset_tokens (
    token_hash character varying(63) NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO legal_admin;

--
-- Name: persons; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.persons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    created_by integer,
    name text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb,
    threat_level character varying DEFAULT 'low'::character varying NOT NULL,
    status character varying DEFAULT 'surveillance'::character varying NOT NULL,
    description text DEFAULT ''::text,
    last_seen character varying,
    last_location text,
    cases jsonb DEFAULT '[]'::jsonb,
    photos jsonb DEFAULT '[]'::jsonb,
    photo_url text,
    ai jsonb DEFAULT 'null'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.persons OWNER TO legal_admin;

--
-- Name: persons_of_interest; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.persons_of_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    name character varying(255) NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    relationship character varying(100),
    threat_level character varying(20) DEFAULT 'low'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    profile_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.persons_of_interest OWNER TO legal_admin;

--
-- Name: poi_photos; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.poi_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poi_id uuid NOT NULL,
    minio_key text NOT NULL,
    thumbnail_key text,
    url text NOT NULL,
    thumbnail_url text,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    size bigint NOT NULL,
    ai_caption text,
    ai_tags jsonb DEFAULT '[]'::jsonb,
    exif_data jsonb,
    forensic_data jsonb,
    face_embedding text,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.poi_photos OWNER TO legal_admin;

--
-- Name: rag_messages; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.rag_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rag_messages OWNER TO legal_admin;

--
-- Name: rag_sessions; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.rag_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    case_id uuid,
    title character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rag_sessions OWNER TO legal_admin;

--
-- Name: reports; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    created_by integer,
    title character varying(255) NOT NULL,
    content text,
    status public.report_status DEFAULT 'draft'::public.report_status NOT NULL,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.reports OWNER TO legal_admin;

--
-- Name: saved_reports; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.saved_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    report_id uuid NOT NULL,
    case_id uuid,
    saved_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.saved_reports OWNER TO legal_admin;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.sessions (
    id text DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO legal_admin;

--
-- Name: statutes; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.statutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    jurisdiction character varying(100),
    effective_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.statutes OWNER TO legal_admin;

--
-- Name: storage_files; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.storage_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    original_name text,
    bucket text NOT NULL,
    user_id integer,
    size bigint NOT NULL,
    mime text,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.storage_files OWNER TO legal_admin;

--
-- Name: themes; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    name character varying(100) NOT NULL,
    config jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.themes OWNER TO legal_admin;

--
-- Name: user_ai_queries; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.user_ai_queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    case_id uuid,
    query text NOT NULL,
    response text NOT NULL,
    model character varying(100) NOT NULL,
    query_type character varying(50) NOT NULL,
    confidence numeric(3,2),
    processing_time integer,
    context_used jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_ai_queries OWNER TO legal_admin;

--
-- Name: user_embeddings; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.user_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    embedding text NOT NULL,
    model character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_embeddings OWNER TO legal_admin;

--
-- Name: users; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    role public.user_role DEFAULT 'prosecutor'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hashed_password character varying(255) NOT NULL,
    name character varying(255)
);


ALTER TABLE public.users OWNER TO legal_admin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: legal_admin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO legal_admin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: legal_admin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vector_jobs; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.vector_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    result jsonb,
    error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vector_jobs OWNER TO legal_admin;

--
-- Name: vector_metadata; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.vector_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id text NOT NULL,
    collection_name character varying(100) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    content_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vector_metadata OWNER TO legal_admin;

--
-- Name: vector_outbox; Type: TABLE; Schema: public; Owner: legal_admin
--

CREATE TABLE public.vector_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type character varying(256) NOT NULL,
    owner_id character varying(256) NOT NULL,
    event character varying(256) NOT NULL,
    vector text,
    payload jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vector_outbox OWNER TO legal_admin;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: legal_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: chat_embeddings id; Type: DEFAULT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.chat_embeddings ALTER COLUMN id SET DEFAULT nextval('public.chat_embeddings_id_seq'::regclass);


--
-- Name: email_verification_codes id; Type: DEFAULT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.email_verification_codes ALTER COLUMN id SET DEFAULT nextval('public.email_verification_codes_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: legal_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: ai_reports ai_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.ai_reports
    ADD CONSTRAINT ai_reports_pkey PRIMARY KEY (id);


--
-- Name: attachment_verifications attachment_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.attachment_verifications
    ADD CONSTRAINT attachment_verifications_pkey PRIMARY KEY (id);


--
-- Name: auto_tags auto_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.auto_tags
    ADD CONSTRAINT auto_tags_pkey PRIMARY KEY (id);


--
-- Name: canvas_annotations canvas_annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.canvas_annotations
    ADD CONSTRAINT canvas_annotations_pkey PRIMARY KEY (id);


--
-- Name: canvas_autosaves canvas_autosaves_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.canvas_autosaves
    ADD CONSTRAINT canvas_autosaves_pkey PRIMARY KEY (id);


--
-- Name: canvas_states canvas_states_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.canvas_states
    ADD CONSTRAINT canvas_states_pkey PRIMARY KEY (id);


--
-- Name: case_activities case_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.case_activities
    ADD CONSTRAINT case_activities_pkey PRIMARY KEY (id);


--
-- Name: case_embeddings case_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.case_embeddings
    ADD CONSTRAINT case_embeddings_pkey PRIMARY KEY (id);


--
-- Name: case_scores case_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.case_scores
    ADD CONSTRAINT case_scores_pkey PRIMARY KEY (id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: chat_embeddings chat_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.chat_embeddings
    ADD CONSTRAINT chat_embeddings_pkey PRIMARY KEY (id);


--
-- Name: citations citations_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.citations
    ADD CONSTRAINT citations_pkey PRIMARY KEY (id);


--
-- Name: codemod_memories codemod_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.codemod_memories
    ADD CONSTRAINT codemod_memories_pkey PRIMARY KEY (id);


--
-- Name: content_embeddings content_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.content_embeddings
    ADD CONSTRAINT content_embeddings_pkey PRIMARY KEY (id);


--
-- Name: criminals criminals_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.criminals
    ADD CONSTRAINT criminals_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_processing document_processing_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.document_processing
    ADD CONSTRAINT document_processing_pkey PRIMARY KEY (id);


--
-- Name: document_summaries document_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.document_summaries
    ADD CONSTRAINT document_summaries_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_verification_codes email_verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);


--
-- Name: evidence evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.evidence
    ADD CONSTRAINT evidence_pkey PRIMARY KEY (id);


--
-- Name: evidence_vectors evidence_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.evidence_vectors
    ADD CONSTRAINT evidence_vectors_pkey PRIMARY KEY (id);


--
-- Name: hash_verifications hash_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.hash_verifications
    ADD CONSTRAINT hash_verifications_pkey PRIMARY KEY (id);


--
-- Name: legal_analysis_sessions legal_analysis_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.legal_analysis_sessions
    ADD CONSTRAINT legal_analysis_sessions_pkey PRIMARY KEY (id);


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);


--
-- Name: legal_precedents legal_precedents_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.legal_precedents
    ADD CONSTRAINT legal_precedents_pkey PRIMARY KEY (id);


--
-- Name: legal_research legal_research_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.legal_research
    ADD CONSTRAINT legal_research_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: persons_of_interest persons_of_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.persons_of_interest
    ADD CONSTRAINT persons_of_interest_pkey PRIMARY KEY (id);


--
-- Name: persons persons_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.persons
    ADD CONSTRAINT persons_pkey PRIMARY KEY (id);


--
-- Name: poi_photos poi_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.poi_photos
    ADD CONSTRAINT poi_photos_pkey PRIMARY KEY (id);


--
-- Name: rag_messages rag_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.rag_messages
    ADD CONSTRAINT rag_messages_pkey PRIMARY KEY (id);


--
-- Name: rag_sessions rag_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.rag_sessions
    ADD CONSTRAINT rag_sessions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: saved_reports saved_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.saved_reports
    ADD CONSTRAINT saved_reports_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: statutes statutes_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.statutes
    ADD CONSTRAINT statutes_pkey PRIMARY KEY (id);


--
-- Name: storage_files storage_files_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.storage_files
    ADD CONSTRAINT storage_files_pkey PRIMARY KEY (id);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: user_ai_queries user_ai_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.user_ai_queries
    ADD CONSTRAINT user_ai_queries_pkey PRIMARY KEY (id);


--
-- Name: user_embeddings user_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.user_embeddings
    ADD CONSTRAINT user_embeddings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vector_jobs vector_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.vector_jobs
    ADD CONSTRAINT vector_jobs_pkey PRIMARY KEY (id);


--
-- Name: vector_metadata vector_metadata_document_id_unique; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.vector_metadata
    ADD CONSTRAINT vector_metadata_document_id_unique UNIQUE (document_id);


--
-- Name: vector_metadata vector_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.vector_metadata
    ADD CONSTRAINT vector_metadata_pkey PRIMARY KEY (id);


--
-- Name: vector_outbox vector_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.vector_outbox
    ADD CONSTRAINT vector_outbox_pkey PRIMARY KEY (id);


--
-- Name: idx_chat_embeddings_embedding; Type: INDEX; Schema: public; Owner: legal_admin
--

CREATE INDEX idx_chat_embeddings_embedding ON public.chat_embeddings USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='50');


--
-- Name: idx_legal_documents_metadata; Type: INDEX; Schema: public; Owner: legal_admin
--

CREATE INDEX idx_legal_documents_metadata ON public.legal_documents USING gin (metadata);


--
-- Name: ai_reports ai_reports_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.ai_reports
    ADD CONSTRAINT ai_reports_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: case_scores case_scores_calculated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.case_scores
    ADD CONSTRAINT case_scores_calculated_by_users_id_fk FOREIGN KEY (calculated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: case_scores case_scores_case_id_cases_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.case_scores
    ADD CONSTRAINT case_scores_case_id_cases_id_fk FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: legal_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xPslCkYM3E6vJYVcQGwLasaaaD4gNTVoIx3UgWskK6h1sDZx3yMZdbZlU5BL1jI

