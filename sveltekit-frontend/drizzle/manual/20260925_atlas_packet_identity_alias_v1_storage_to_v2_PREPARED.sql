-- SUPERSEDED 2026-09-25: do NOT apply. Operator direction is a registry-backed alias target (no FK drop, no atlas_packets.packet_key_v2). Kept for history; see docs/reports/repository-identity-and-current-ast-reconciliation-v1.json
-- PREPARED, NOT APPLIED — status: PACKET_KEY_ALIAS_DDL_APPLY_AUTHORIZATION_REQUIRED
--
-- Adds ONE alias kind, PACKET_KEY_V1_STORAGE_TO_V2, to the existing atlas_packet_identity_aliases owner:
--   alias_key            = physical historical storage key already stored in atlas_packets (packet:<12hex> or ace:packet:<12hex>)
--   canonical_packet_key = PacketKeyV2 (packet:<uuidv5>); NOT physically stored for historical rows
-- No atlas_packets column is added. No atlas_packets row is modified. No dependent-table FK is touched.
--
-- Why the existing FK must be replaced: canonical_packet_key REFERENCES atlas_packets(packet_key) can only ever point at a
-- stored key, so it cannot express legacy -> V2 for rows that have no V2 row. It is replaced by kind-aware triggers that keep
-- the same guarantees for the existing kind and add the new kind's rules.
--
-- Existing-row impact: 0 rows changed by this DDL. Existing aliases: 3,294 (PREFIX_DIVERGENCE_ACE_PACKET).
-- Expected NEW alias rows (separate, later, authorized apply): 17,399 (17,301 packet:<12hex> + 98 ace:packet:<12hex>).
-- Read-only collision census (docs/reports/packet-key-v2-legacy-population-census-v1.json): 0 canonical collisions.
-- Not covered: 44,256 packets with no Graphify membership (no repository authority) and 62 non-file packets stay legacy-only.
--
-- Rollback: 20260925_atlas_packet_identity_alias_v1_storage_to_v2_ROLLBACK.sql

BEGIN;

ALTER TABLE public.atlas_packet_identity_aliases
  DROP CONSTRAINT IF EXISTS atlas_packet_identity_aliases_canonical_packet_key_fkey;

ALTER TABLE public.atlas_packet_identity_aliases
  ADD CONSTRAINT atlas_packet_identity_aliases_no_self_alias CHECK (alias_key <> canonical_packet_key);

-- One physical storage row per logical packet: a V2 canonical key may be the target of at most one storage alias.
CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_packet_alias_v1_storage_to_v2_canonical
  ON public.atlas_packet_identity_aliases (canonical_packet_key)
  WHERE alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2';

CREATE OR REPLACE FUNCTION public.atlas_packet_identity_alias_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.alias_kind = 'PREFIX_DIVERGENCE_ACE_PACKET' THEN
    -- Unchanged guarantee: the canonical target is a stored atlas_packets key (previously enforced by the FK).
    IF NOT EXISTS (SELECT 1 FROM public.atlas_packets WHERE packet_key = NEW.canonical_packet_key) THEN
      RAISE EXCEPTION 'PACKET_ALIAS_CANONICAL_NOT_STORED: %', NEW.canonical_packet_key USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2' THEN
    IF NEW.alias_key !~ '^(ace:)?packet:[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'PACKET_ALIAS_KEY_NOT_LEGACY_STORAGE_SHAPE: %', NEW.alias_key USING ERRCODE = '23514';
    END IF;
    IF NEW.canonical_packet_key !~ '^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'PACKET_ALIAS_TARGET_NOT_PACKET_KEY_V2: %', NEW.canonical_packet_key USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.atlas_packets WHERE packet_key = NEW.alias_key) THEN
      RAISE EXCEPTION 'PACKET_ALIAS_STORAGE_KEY_NOT_STORED: %', NEW.alias_key USING ERRCODE = '23503';
    END IF;
    -- Fail closed: if the V2 key is ALSO physically stored, the logical packet would have two storage rows.
    IF EXISTS (SELECT 1 FROM public.atlas_packets WHERE packet_key = NEW.canonical_packet_key) THEN
      RAISE EXCEPTION 'PACKET_KEY_CANONICAL_COLLISION: % is stored and aliased from %', NEW.canonical_packet_key, NEW.alias_key USING ERRCODE = '23505';
    END IF;
  ELSE
    RAISE EXCEPTION 'PACKET_ALIAS_KIND_UNKNOWN: %', NEW.alias_kind USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_atlas_packet_identity_alias_guard
  BEFORE INSERT OR UPDATE ON public.atlas_packet_identity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.atlas_packet_identity_alias_guard();

-- Replaces the protection the FK gave against deleting/renaming a stored packet an alias depends on.
CREATE OR REPLACE FUNCTION public.atlas_packets_alias_dependency_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.atlas_packet_identity_aliases
              WHERE (alias_kind = 'PREFIX_DIVERGENCE_ACE_PACKET' AND canonical_packet_key = OLD.packet_key)
                 OR (alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2' AND alias_key = OLD.packet_key)) THEN
    RAISE EXCEPTION 'PACKET_STORAGE_KEY_HAS_ALIAS_DEPENDENTS: %', OLD.packet_key USING ERRCODE = '23503';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_atlas_packets_alias_dependency_guard
  BEFORE DELETE OR UPDATE OF packet_key ON public.atlas_packets
  FOR EACH ROW EXECUTE FUNCTION public.atlas_packets_alias_dependency_guard();

COMMIT;
