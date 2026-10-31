-- ROLLBACK PROHIBITED: Downgrading to legacy vector(384) breaks the EmbeddingGemma
-- semantic_768 contract and MRL (Matryoshka Representation Learning) 128-D prefix topology.
DO $$
BEGIN
  RAISE EXCEPTION 'Rollback to legacy vector(384) is prohibited: breaks EmbeddingGemma MRL contract. All dense representations must remain vector(768).';
END
$$;
