#!/usr/bin/env node
/**
 * Gemma3-Legal Agent Service
 * LangChain agent with web crawling and evidence search capabilities
 */

import { ChatOllama } from '@langchain/ollama';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { Tool } from '@langchain/core/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

class WebCrawlTool extends Tool {
  constructor() {
    super();
    this.name = 'web_crawl_legal_documents';
    this.description = 'Crawl legal websites and extract structured document data. Input should be a JSON string with url, maxDepth, maxPages, and other crawl parameters.';
  }

  async _call(input) {
    try {
      const params = JSON.parse(input);

      // Call MCP server web crawl tool
      const response = await fetch('http://localhost:3003/mcp/tools/web_crawl_legal_documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`MCP crawl failed: ${response.status}`);
      }

      const result = await response.json();
      return JSON.stringify(result);
    } catch (error) {
      return `Error crawling web: ${error.message}`;
    }
  }
}

class EvidenceSearchTool extends Tool {
  constructor() {
    super();
    this.name = 'search_legal_evidence';
    this.description = 'Search for legal evidence in the vector database. Input should be a search query string.';
  }

  async _call(query) {
    try {
      // Call vector search API (assuming we have a search endpoint)
      const response = await fetch('http://localhost:8094/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 10,
          threshold: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`Vector search failed: ${response.status}`);
      }

      const results = await response.json();
      return JSON.stringify(results);
    } catch (error) {
      return `Error searching evidence: ${error.message}`;
    }
  }
}

class DocumentAnalysisTool extends Tool {
  constructor() {
    super();
    this.name = 'analyze_legal_document';
    this.description = 'Analyze a legal document for key clauses, obligations, and risks. Input should be document text.';
  }

  async _call(documentText) {
    try {
      // Call Ollama directly for document analysis
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt: `Analyze this legal document and extract key information:

Document Text:
${documentText}

Please provide:
1. Document type and purpose
2. Key parties involved
3. Important clauses and obligations
4. Potential risks or concerns
5. Recommendations

Analysis:`,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama analysis failed: ${response.status}`);
      }

      const result = await response.json();
      return result.response;
    } catch (error) {
      return `Error analyzing document: ${error.message}`;
    }
  }
}

class Gemma3LegalAgent {
  constructor() {
    this.app = express();
    this.port = process.env.AGENT_PORT || 8095;
    this.agent = null;
    this.tools = [
      new WebCrawlTool(),
      new EvidenceSearchTool(),
      new DocumentAnalysisTool()
    ];

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  async initializeAgent() {
    try {
      // Initialize Ollama chat model
      const llm = new ChatOllama({
        baseUrl: 'http://localhost:11434',
        model: 'gemma3-legal:latest',
        temperature: 0.1,
        maxTokens: 2048
      });

      // Create prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are Gemma3-Legal, an expert legal AI assistant specialized in contract analysis, evidence collection, and legal research.

Your capabilities include:
- Web crawling for legal documents and evidence
- Searching existing legal evidence databases
- Analyzing legal documents for key clauses and risks
- Providing legal recommendations based on evidence

Always be thorough, cite sources, and provide balanced legal analysis. When collecting evidence, prioritize authoritative legal sources.

Available tools:
- web_crawl_legal_documents: Crawl legal websites for documents
- search_legal_evidence: Search existing evidence database
- analyze_legal_document: Analyze specific legal documents

Structure your responses clearly and provide actionable recommendations.`
        ],
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad')
      ]);

      // Create agent
      const agent = await createOpenAIFunctionsAgent({
        llm,
        tools: this.tools,
        prompt
      });

      this.agent = new AgentExecutor({
        agent,
        tools: this.tools,
        verbose: true,
        maxIterations: 5,
        returnIntermediateSteps: true
      });

      console.log('✅ Gemma3-Legal agent initialized');
    } catch (error) {
      console.error('❌ Failed to initialize agent:', error);
      throw error;
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: 'gemma3-legal',
        tools: this.tools.map(t => t.name),
        timestamp: new Date().toISOString()
      });
    });

    // Legal analysis endpoint
    this.app.post('/analyze', async (req, res) => {
      try {
        const { query, context = {} } = req.body;

        if (!query) {
          return res.status(400).json({ error: 'Query is required' });
        }

        if (!this.agent) {
          return res.status(503).json({ error: 'Agent not initialized' });
        }

        console.log(`🔍 Processing legal analysis query: ${query.substring(0, 100)}...`);

        const result = await this.agent.call({
          input: query,
          context
        });

        res.json({
          success: true,
          query,
          response: result.output,
          intermediate_steps: result.intermediateSteps,
          tools_used: result.intermediateSteps?.map(step => step.action?.tool) || [],
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Analysis error:', error);
        res.status(500).json({
          error: 'Analysis failed',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Evidence collection endpoint
    this.app.post('/collect-evidence', async (req, res) => {
      try {
        const { urls, query, maxDepth = 2, maxPages = 5 } = req.body;

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          return res.status(400).json({ error: 'URLs array is required' });
        }

        const evidenceResults = [];

        for (const url of urls) {
          try {
            console.log(`🌐 Collecting evidence from: ${url}`);

            // Use web crawl tool
            const crawlTool = this.tools.find(t => t.name === 'web_crawl_legal_documents');
            const crawlResult = await crawlTool._call(JSON.stringify({
              url,
              maxDepth,
              maxPages,
              legalDomains: ['court.gov', 'law.com', 'justice.gov', 'supremecourt.gov'],
              extractMetadata: true
            }));

            const parsedResult = JSON.parse(crawlResult);

            if (parsedResult.content && parsedResult.content[0]) {
              const resultData = JSON.parse(parsedResult.content[0].text);
              evidenceResults.push({
                url,
                status: 'success',
                documents_found: resultData.results?.pages?.length || 0,
                ingestion_job_id: resultData.ingestion_job_id,
                data: resultData.results
              });
            } else {
              evidenceResults.push({
                url,
                status: 'error',
                error: 'No content in crawl result'
              });
            }

          } catch (error) {
            evidenceResults.push({
              url,
              status: 'error',
              error: error.message
            });
          }
        }

        res.json({
          success: true,
          evidence_collected: evidenceResults.filter(r => r.status === 'success').length,
          total_urls: urls.length,
          results: evidenceResults,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Evidence collection error:', error);
        res.status(500).json({
          error: 'Evidence collection failed',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Document analysis endpoint
    this.app.post('/analyze-document', async (req, res) => {
      try {
        const { documentText, documentType = 'contract' } = req.body;

        if (!documentText) {
          return res.status(400).json({ error: 'Document text is required' });
        }

        console.log(`📄 Analyzing ${documentType} document (${documentText.length} chars)`);

        const analysisTool = this.tools.find(t => t.name === 'analyze_legal_document');
        const analysis = await analysisTool._call(documentText);

        res.json({
          success: true,
          document_type: documentType,
          analysis,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Document analysis error:', error);
        res.status(500).json({
          error: 'Document analysis failed',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  async start() {
    try {
      await this.initializeAgent();

      this.app.listen(this.port, () => {
        console.log(`🚀 Gemma3-Legal Agent Service running on port ${this.port}`);
        console.log(`📊 Health check: http://localhost:${this.port}/health`);
        console.log(`🔍 Analysis endpoint: http://localhost:${this.port}/analyze`);
        console.log(`🌐 Evidence collection: http://localhost:${this.port}/collect-evidence`);
        console.log(`📄 Document analysis: http://localhost:${this.port}/analyze-document`);
      });
    } catch (error) {
      console.error('❌ Failed to start Gemma3-Legal agent:', error);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const agent = new Gemma3LegalAgent();
  agent.start().catch(console.error);
}

module.exports = { Gemma3LegalAgent };
