# Packet Enrichment Lanes

Generated: 2026-06-18T22:08:44.760Z
Status: APPLIED

## Summary

- input rows: 10
- selected rows: 10
- vector rows: 5
- terms rows: 10
- pagerank rows: 10
- cosine rows: 5
- summary rows: 0
- summary deferred rows: 10
- som rows: 10
- missing vector rows: 5

## Samples

- 05dbd8cc7c550bbe | lanes=397, 895884c03a86a386, mcp_tool_stub, packet_spine, langextract, som20x20, pagerank | neighbors=0 | summary=no
- 05f26c6dc1b51a12 | lanes=117, atlas.search, codebase_chunks_768, mcp_tool_stub, source_ref, langextract, cosine_top10, som20x20, pagerank | neighbors=4 | summary=no
- 08dce8e980d1e261 | lanes=37, 4a0c3649b58e6c1e, mcp_tool_stub, packet_spine, langextract, cosine_top10, som20x20, pagerank | neighbors=4 | summary=no
- 0e584542cbd3ec1f | lanes=121b02dff31f995b, 336, mcp_tool_stub, packet_spine, langextract, cosine_top10, som20x20, pagerank | neighbors=4 | summary=no
- 106474ac880329aa | lanes=79, 931687f31329e048, mcp_tool_stub, packet_spine, langextract, som20x20, pagerank | neighbors=0 | summary=no
- 1125b964826d67d7 | lanes=32, 6a545f1e8ce22358, mcp_tool_stub, packet_spine, langextract, cosine_top10, som20x20, pagerank | neighbors=4 | summary=no
- 119403f1ca0164b4 | lanes=322, 5a8f718e6f8c271a, mcp_tool_stub, packet_spine, langextract, cosine_top10, som20x20, pagerank | neighbors=4 | summary=no
- 13039d77318546e0 | lanes=378, 4521761888863c86, mcp_tool_stub, packet_spine, langextract, som20x20, pagerank | neighbors=0 | summary=no

## Next Safe Action

Use the enriched file as the source for TurboVec, Neo4j, and HyperRAG downstream passes.
