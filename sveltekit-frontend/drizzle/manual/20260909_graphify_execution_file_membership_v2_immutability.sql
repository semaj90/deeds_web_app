-- GRAPHIFY-MEMBERSHIP-V2-IMMUTABILITY-01
-- Additive trigger hardening for repository-qualified execution evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.graphify_execution_file_membership_v2_reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'graphify_execution_file_membership_v2 is append-only evidence: % is not permitted (execution_id=%, repository_id=%, repository_relative_path=%)',
    TG_OP,
    COALESCE(OLD.execution_id, NEW.execution_id),
    COALESCE(OLD.repository_id, NEW.repository_id),
    COALESCE(OLD.repository_relative_path, NEW.repository_relative_path);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS graphify_execution_file_membership_v2_reject_update
  ON public.graphify_execution_file_membership_v2;
CREATE TRIGGER graphify_execution_file_membership_v2_reject_update
  BEFORE UPDATE ON public.graphify_execution_file_membership_v2
  FOR EACH ROW EXECUTE FUNCTION public.graphify_execution_file_membership_v2_reject_mutation();

DROP TRIGGER IF EXISTS graphify_execution_file_membership_v2_reject_delete
  ON public.graphify_execution_file_membership_v2;
CREATE TRIGGER graphify_execution_file_membership_v2_reject_delete
  BEFORE DELETE ON public.graphify_execution_file_membership_v2
  FOR EACH ROW EXECUTE FUNCTION public.graphify_execution_file_membership_v2_reject_mutation();

COMMIT;
