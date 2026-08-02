import { describe, expect, it } from 'vitest';
import { AtlasWorkflowLineageBundleSchema } from './workflow-lineage.js';

describe('workflow-lineage contract', () => {
  it('keeps workflow, research, fetch, source, extraction, document, chunk, and synthesis identities separate', () => {
    const bundle = AtlasWorkflowLineageBundleSchema.parse({
      workflow: {
        agentic_workflow_id: '11111111-1111-4111-8111-111111111111',
        workflow_key: 'deep_research',
        workflow_version: 3,
        schema_version: 'atlas.workflow.v1',
        name: 'Deep Research',
        description: 'Bounded acquisition and synthesis workflow',
      },
      workflowRun: {
        workflow_run_id: '22222222-2222-4222-8222-222222222222',
        agentic_workflow_id: '11111111-1111-4111-8111-111111111111',
        workspace_id: 'legal-ai:deeds-web-app',
        workspace_revision: 1842,
        status: 'running',
        trigger_type: 'mcp_tool_call',
      },
      researchRun: {
        research_run_id: '33333333-3333-4333-8333-333333333333',
        workflow_run_id: '22222222-2222-4222-8222-222222222222',
        question: 'What is the ingestion path for web sources?',
        strategy: 'bounded_search_then_acquire',
        research_profile: 'source_validation',
        max_iterations: 3,
        max_sources: 12,
        status: 'searching',
      },
      fetchAttempt: {
        fetch_id: '44444444-4444-4444-8444-444444444444',
        workflow_run_id: '22222222-2222-4222-8222-222222222222',
        research_run_id: '33333333-3333-4333-8333-333333333333',
        requested_url: 'https://example.com',
        final_url: 'https://example.com',
        acquisition_mode: 'http_html',
        status: 'fetched',
      },
      sourceRevision: {
        source_revision_id: '55555555-5555-4555-8555-555555555555',
        web_source_id: '66666666-6666-4666-8666-666666666666',
        source_revision: 'sha256:abc123',
        final_url: 'https://example.com',
        canonical_url: 'https://example.com',
        content_digest: 'sha256:def456',
        content_type: 'text/html',
        storage_uri: 's3://evidence/example.html',
      },
      extraction: {
        extraction_id: '77777777-7777-4777-8777-777777777777',
        source_revision_id: '55555555-5555-4555-8555-555555555555',
        workflow_run_id: '22222222-2222-4222-8222-222222222222',
        extraction_type: 'beautifulsoup_html',
        extractor_name: 'beautifulsoup',
        extractor_version: '4.13.4',
        schema_version: 'atlas.extraction.v1',
      },
      documentNode: {
        document_node_id: 'document:example:heading-1',
        extraction_id: '77777777-7777-4777-8777-777777777777',
        source_revision_id: '55555555-5555-4555-8555-555555555555',
        node_kind: 'heading',
        ordinal: 0,
      },
      chunk: {
        chunk_id: 'chunk:example:0001',
        source_revision_id: '55555555-5555-4555-8555-555555555555',
        extraction_id: '77777777-7777-4777-8777-777777777777',
        document_node_ids: ['document:example:heading-1'],
      },
      synthesis: {
        synthesis_id: '88888888-8888-4888-8888-888888888888',
        workflow_run_id: '22222222-2222-4222-8222-222222222222',
        retrieval_run_id: '99999999-9999-4999-8999-999999999999',
        model_provider: 'ollama',
        model_name: 'gemma4',
        model_revision: 'gemma4-legal-iq4xs-direct.gguf',
      },
    });

    expect(bundle.workflow.agentic_workflow_id).not.toBe(bundle.workflowRun.workflow_run_id);
    expect(bundle.workflowRun.workflow_run_id).not.toBe(bundle.researchRun.research_run_id);
    expect(bundle.researchRun.research_run_id).not.toBe(bundle.fetchAttempt.fetch_id);
    expect(bundle.fetchAttempt.fetch_id).not.toBe(bundle.sourceRevision.source_revision_id);
    expect(bundle.sourceRevision.source_revision_id).not.toBe(bundle.extraction.extraction_id);
    expect(bundle.extraction.extraction_id).not.toBe(bundle.documentNode.document_node_id);
    expect(bundle.documentNode.document_node_id).not.toBe(bundle.chunk.chunk_id);
    expect(bundle.chunk.chunk_id).not.toBe(bundle.synthesis.synthesis_id);
  });

  it('rejects tree_node_id in the workflow lineage bundle', () => {
    expect(() =>
      AtlasWorkflowLineageBundleSchema.parse({
        workflow: {
          agentic_workflow_id: '11111111-1111-4111-8111-111111111111',
          workflow_key: 'deep_research',
          workflow_version: 3,
          schema_version: 'atlas.workflow.v1',
          name: 'Deep Research',
        },
        workflowRun: {
          workflow_run_id: '22222222-2222-4222-8222-222222222222',
          agentic_workflow_id: '11111111-1111-4111-8111-111111111111',
          workspace_id: 'legal-ai:deeds-web-app',
          workspace_revision: 1842,
          status: 'running',
          trigger_type: 'mcp_tool_call',
          tree_node_id: 'tree:should-not-exist',
        },
        researchRun: {
          research_run_id: '33333333-3333-4333-8333-333333333333',
          workflow_run_id: '22222222-2222-4222-8222-222222222222',
          question: 'What is the ingestion path for web sources?',
          strategy: 'bounded_search_then_acquire',
          research_profile: 'source_validation',
          max_iterations: 3,
          max_sources: 12,
          status: 'searching',
        },
        fetchAttempt: {
          fetch_id: '44444444-4444-4444-8444-444444444444',
          workflow_run_id: '22222222-2222-4222-8222-222222222222',
          requested_url: 'https://example.com',
          final_url: 'https://example.com',
          acquisition_mode: 'http_html',
          status: 'fetched',
        },
        sourceRevision: {
          source_revision_id: '55555555-5555-4555-8555-555555555555',
          web_source_id: '66666666-6666-4666-8666-666666666666',
          source_revision: 'sha256:abc123',
          final_url: 'https://example.com',
          canonical_url: 'https://example.com',
          content_digest: 'sha256:def456',
          content_type: 'text/html',
          storage_uri: 's3://evidence/example.html',
        },
        extraction: {
          extraction_id: '77777777-7777-4777-8777-777777777777',
          source_revision_id: '55555555-5555-4555-8555-555555555555',
          extraction_type: 'beautifulsoup_html',
          extractor_name: 'beautifulsoup',
          extractor_version: '4.13.4',
          schema_version: 'atlas.extraction.v1',
        },
        documentNode: {
          document_node_id: 'document:example:heading-1',
          extraction_id: '77777777-7777-4777-8777-777777777777',
          source_revision_id: '55555555-5555-4555-8555-555555555555',
          node_kind: 'heading',
          ordinal: 0,
        },
        chunk: {
          chunk_id: 'chunk:example:0001',
          source_revision_id: '55555555-5555-4555-8555-555555555555',
          extraction_id: '77777777-7777-4777-8777-777777777777',
          document_node_ids: ['document:example:heading-1'],
        },
        synthesis: {
          synthesis_id: '88888888-8888-4888-8888-888888888888',
          workflow_run_id: '22222222-2222-4222-8222-222222222222',
          retrieval_run_id: '99999999-9999-4999-8999-999999999999',
          model_provider: 'ollama',
          model_name: 'gemma4',
          model_revision: 'gemma4-legal-iq4xs-direct.gguf',
        },
      })
    ).toThrow();
  });
});
