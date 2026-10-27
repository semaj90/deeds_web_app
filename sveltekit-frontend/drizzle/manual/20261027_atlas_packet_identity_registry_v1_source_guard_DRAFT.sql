-- DRAFT ONLY: requires the registry-v1 tables from 20261020_atlas_packet_identity_registry_v1_DRAFT.sql.
-- Prevents a storage alias from binding a canonical source identity to another packet's source_ref.

CREATE OR REPLACE FUNCTION public.atlas_packet_identity_aliases_v1_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_source_ref TEXT;
  storage_source_ref TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PACKET_IDENTITY_ALIAS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  SELECT source_ref INTO canonical_source_ref
    FROM public.atlas_packet_identity_registry_v1
   WHERE packet_key = NEW.canonical_packet_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKET_IDENTITY_REGISTRY_ROW_MISSING: %', NEW.canonical_packet_key USING ERRCODE = '23503';
  END IF;

  SELECT source_ref INTO storage_source_ref
    FROM public.atlas_packets
   WHERE packet_key = NEW.storage_packet_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKET_STORAGE_ROW_MISSING: %', NEW.storage_packet_key USING ERRCODE = '23503';
  END IF;

  IF canonical_source_ref <> storage_source_ref THEN
    RAISE EXCEPTION 'PACKET_IDENTITY_ALIAS_SOURCE_MISMATCH: % <> %', canonical_source_ref, storage_source_ref USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_atlas_packet_identity_aliases_v1_guard'
       AND tgrelid = 'public.atlas_packet_identity_aliases_v1'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_atlas_packet_identity_aliases_v1_guard
      BEFORE INSERT OR UPDATE ON public.atlas_packet_identity_aliases_v1
      FOR EACH ROW EXECUTE FUNCTION public.atlas_packet_identity_aliases_v1_guard_fn();
  END IF;
END;
$$;
