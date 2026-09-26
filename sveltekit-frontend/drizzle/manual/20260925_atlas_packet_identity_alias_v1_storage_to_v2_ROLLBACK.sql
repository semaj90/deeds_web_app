-- SUPERSEDED 2026-09-25: do NOT apply. Operator direction is a registry-backed alias target (no FK drop, no atlas_packets.packet_key_v2). Kept for history; see docs/reports/repository-identity-and-current-ast-reconciliation-v1.json
-- ROLLBACK for 20260925_atlas_packet_identity_alias_v1_storage_to_v2_PREPARED.sql (not applied).
-- Removes only rows of the new alias kind, then restores the original FK. The original FK re-validates that every
-- remaining canonical_packet_key (the 3,294 PREFIX_DIVERGENCE_ACE_PACKET rows) is a stored atlas_packets key.
BEGIN;
DROP TRIGGER IF EXISTS trg_atlas_packets_alias_dependency_guard ON public.atlas_packets;
DROP TRIGGER IF EXISTS trg_atlas_packet_identity_alias_guard ON public.atlas_packet_identity_aliases;
DELETE FROM public.atlas_packet_identity_aliases WHERE alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2';
DROP FUNCTION IF EXISTS public.atlas_packets_alias_dependency_guard();
DROP FUNCTION IF EXISTS public.atlas_packet_identity_alias_guard();
DROP INDEX IF EXISTS public.uq_atlas_packet_alias_v1_storage_to_v2_canonical;
ALTER TABLE public.atlas_packet_identity_aliases DROP CONSTRAINT IF EXISTS atlas_packet_identity_aliases_no_self_alias;
ALTER TABLE public.atlas_packet_identity_aliases
  ADD CONSTRAINT atlas_packet_identity_aliases_canonical_packet_key_fkey
  FOREIGN KEY (canonical_packet_key) REFERENCES public.atlas_packets(packet_key);
COMMIT;
