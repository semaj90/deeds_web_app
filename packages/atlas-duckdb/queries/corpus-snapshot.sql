-- snapshot_packets: canonical packet + normalized fact snapshot
SELECT
  p.packet_key,
  p.source_ref,
  p.summary,
  p.domain_class AS legacy_domain,
  d.domain_class AS normalized_domain,
  l.lexical_summary,
  l.keywords,
  l.identifiers,
  s.ast_facts,
  s.symbol_name,
  s.symbol_kind,
  s.tree_node_id,
  p.content_hash,
  p.summary_hash
FROM canonical_pg.atlas_packets AS p
LEFT JOIN canonical_pg.feature_domain_facts AS d USING (packet_key)
LEFT JOIN canonical_pg.feature_lexical_facts AS l USING (packet_key)
LEFT JOIN canonical_pg.feature_structural_facts AS s USING (packet_key);
