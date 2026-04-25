# Codebase Search Findings: Web Search & Agentic Functions

## 🔍 Search Results Summary

### Existing Agentic Infrastructure ✅

1. **ACE (Agentic Control Engine)**
   - Location: `backend/services/ace_orchestrator.py`
   - Purpose: Orchestrates agentic sessions with context management
   - Features: Signal building, LLM integration, timeline logging

2. **Agentic Context Anchor (ACA)**
   - Location: `backend/services/agent_context.py`
   - Purpose: Prevents context loss during long agent sessions
   - Features: Plan management, summaries, context overflow handling

3. **Agent API**
   - Location: `backend/api/agent_api.py`
   - Purpose: FastAPI endpoints for agentic sessions
   - Features: General agent operations

4. **Phase 72 Agent API**
   - Location: `backend/api/phase72_agent_api.py`
   - Purpose: Core "what should I fix next?" endpoint
   - Features: ACE orchestration, tool routing

### Existing Web Search Infrastructure ✅

1. **Gemma3 Web Search Service**
   - Location: `gemma3-vlm-web-search.py`
   - Features: VLM-powered web search and analysis
   - Method: `web_search()` with configurable search engines

2. **Gemma3 VLM Web Search Service**
   - Location: `gemma3_vlm_web_search_service.py`
   - Features: Web search with optional VLM analysis
   - Endpoints: `/search`, `/legal-research`

3. **Search API**
   - Location: `backend/api/search_api.py`
   - Purpose: Agentic legal search with alignment routing
   - Features: RAG, KAG, topology feedback

4. **Search Routes**
   - Location: `backend/api/search_routes.py`
   - Purpose: Search request/response handling

### Existing HTML Parsing & Crawling ✅

1. **BeautifulSoup Integration**
   - Location: `scripts/legal-document-scraper.py`
   - Features: HTML parsing, content extraction
   - Usage: Search result parsing, case listing extraction

2. **Phase 46 Safe Crawl**
   - Location: `python_codebase/utilities/phase46_safe_crawl.py`
   - Features: Safe URL crawling with robots.txt checking
   - Functions: `allowed_to_crawl()`, `extract_text()`

3. **Document Ingestion Service**
   - Location: `python_codebase/data_ingestion/doc_ingest.py`
   - Features: HTML extraction, content processing
   - Endpoints: `/crawl` endpoint for document crawling

4. **Granite Docling Parser**
   - Location: `python_codebase/document_processing/granite_docling_parser.py`
   - Features: Table extraction, text extraction, layout analysis

### Agentic Bridge Service ✅

- Location: `python_codebase/python-services/agentic_bridge_service.py`
- References:
  - `safe_crawl`: Phase 46 safe crawl utility
  - `web_parse`: SIMD parser service (referenced but not found)
  - `graph_analyze`: Phase 47 graph analyzer

---

## 📊 Integration Opportunities

### For Phase 2 (Citations Implementation)

1. **Use Existing Web Search**
   - Leverage `Gemma3WebSearch` class
   - Integrate with `search_api.py` endpoints
   - Combine with BeautifulSoup for content extraction

2. **Use Existing HTML Parsing**
   - Leverage `phase46_safe_crawl.py` for safe crawling
   - Use BeautifulSoup for HTML parsing
   - Implement citation extraction on top

3. **Use Existing Agentic Infrastructure**
   - Leverage ACE orchestrator for routing
   - Use ACA for context management
   - Integrate with agent_api.py

### For Phase 3 (Image Processing)

1. **Use Existing VLM Integration**
   - Leverage Gemma3 VLM service
   - Integrate with image extraction from search results
   - Use existing VLM analysis capabilities

### For Phase 4 (Integration)

1. **Use Existing Search Routes**
   - Extend `search_routes.py` for citation search
   - Extend `search_api.py` for image search
   - Leverage existing response models

---

## 🔧 Recommended Implementation Strategy

### Phase 2: Citations

1. **Extend GoogleSearchRetriever**
   - Use existing `Gemma3WebSearch` as reference
   - Integrate BeautifulSoup for content extraction
   - Add citation extraction on top of search results

2. **Leverage Existing Crawling**
   - Use `phase46_safe_crawl.py` for safe URL fetching
   - Use `extract_text()` function for HTML parsing
   - Implement citation extraction

3. **Integrate with ACE**
   - Use ACE orchestrator for routing
   - Use ACA for context management
   - Leverage existing agent infrastructure

### Phase 3: Images

1. **Use Existing VLM Service**
   - Leverage `Gemma3WebSearch` VLM capabilities
   - Extend for image-specific analysis
   - Integrate with image extraction

### Phase 4: Integration

1. **Extend Existing APIs**
   - Extend `search_api.py` for citations
   - Extend `search_routes.py` for image search
   - Leverage existing response models

---

## 📝 Missing Components

### SIMD JSON Parser
- Referenced in `agentic_bridge_service.py` as `web_parse`
- Not found in codebase
- **Recommendation**: Implement or use existing JSON parsing

### Crawl4all
- Not found in codebase
- **Recommendation**: Use existing `phase46_safe_crawl.py` instead

---

## 🎯 Action Items

1. **Phase 2 Implementation**
   - Extend `GoogleSearchRetriever` with BeautifulSoup integration
   - Implement citation extraction
   - Integrate with existing web search services

2. **Leverage Existing Code**
   - Use `phase46_safe_crawl.py` for URL fetching
   - Use `Gemma3WebSearch` for VLM integration
   - Use ACE orchestrator for routing

3. **Extend Existing APIs**
   - Extend `search_api.py` for citations
   - Extend `search_routes.py` for image search
   - Leverage existing response models

---

## 📚 Reference Files

- `backend/services/ace_orchestrator.py` - ACE orchestrator
- `backend/services/agent_context.py` - ACA context management
- `backend/api/search_api.py` - Search API
- `gemma3-vlm-web-search.py` - VLM web search
- `python_codebase/utilities/phase46_safe_crawl.py` - Safe crawling
- `python_codebase/data_ingestion/doc_ingest.py` - Document ingestion
- `scripts/legal-document-scraper.py` - BeautifulSoup integration

---

**Status**: ✅ CODEBASE ANALYSIS COMPLETE
**Ready for Phase 2 Implementation**: YES
