# Gemma3-Legal Agentic MCP Server

**FastMCP server for gemma3-legal:latest with agentic function calling**

## 🎯 Features

### **6 Agentic Tools**
1. **`scrape_url`** - Web scraping with BeautifulSoup (uses 5 existing implementations)
2. **`extract_citations`** - Legal citation extraction (CA Const, Federal, State laws)
3. **`analyze_with_gemma`** - Direct Ollama gemma3-legal:latest integration
4. **`classify_document`** - Legal document classification
5. **`analyze_citation_network`** - Citation graph analysis
6. **`health_check`** - System health monitoring

### **Integrations**
- ✅ **RabbitMQ** - Auto-discovers existing containers (legal-ai-rabbitmq, rabbitmq-legal)
- ✅ **Ollama** - gemma3-legal:latest model
- ✅ **Web Scraping** - BeautifulSoup + aiohttp (from existing services)
- ✅ **Citation Patterns** - From ca_const_ingest.py (10+ types)

---

## 🚀 Quick Start

### **1. Install Dependencies**
```bash
pip install mcp aio-pika aiohttp beautifulsoup4 httpx
```

### **2. Start RabbitMQ (if not running)**
```bash
# Check if already running
docker ps | grep rabbitmq

# If not, start one:
docker run -d \
  --name rabbitmq-legal-mcp \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3.13-management-alpine
```

### **3. Verify Ollama**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Pull gemma3-legal if not exists
ollama pull gemma3-legal:latest
```

### **4. Run MCP Server**
```bash
cd mcp-servers
python gemma3-legal-agentic-mcp.py
```

---

## 🔧 Configuration

### **Environment Variables**
```bash
# .env
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
```

### **Auto-Discovery**
The server will automatically try to connect to existing RabbitMQ containers:
1. `amqp://guest:guest@localhost:5672/` (default)
2. `amqp://legal_admin:123456@localhost:5672/legal_ai` (legal-ai stack)
3. Custom URL from `RABBITMQ_URL` env variable

---

## 📚 Tool Usage

### **Tool 1: Web Scraping**
```json
{
  "name": "scrape_url",
  "arguments": {
    "url": "https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=&chapter=&article=",
    "extract_citations": true
  }
}
```

**Response**:
```json
{
  "url": "https://leginfo.legislature.ca.gov/...",
  "title": "California Labor Code",
  "content": "...(first 5000 chars)...",
  "word_count": 12543,
  "citations": [
    {
      "type": "ca_labor",
      "text": "California Labor Code § 201",
      "position": 145,
      "authority_score": 0.90
    }
  ],
  "citation_count": 34
}
```

### **Tool 2: Citation Extraction**
```json
{
  "name": "extract_citations",
  "arguments": {
    "text": "According to California Constitution Article I, Section 1, and as stated in Brown v. Board of Education, 347 U.S. 483 (1954)...",
    "include_authority_scores": true
  }
}
```

**Response**:
```json
{
  "total_citations": 2,
  "citations": [
    {
      "type": "ca_const",
      "text": "California Constitution Article I, Section 1",
      "position": 13,
      "authority_score": 1.0
    },
    {
      "type": "case_law",
      "text": "Brown v. Board of Education, 347 U.S. 483 (1954)",
      "position": 78,
      "authority_score": 0.75
    }
  ],
  "citation_types": ["ca_const", "case_law"]
}
```

### **Tool 3: Analyze with Gemma**
```json
{
  "name": "analyze_with_gemma",
  "arguments": {
    "prompt": "Summarize the key points of California Labor Code § 1194 regarding wage claims.",
    "system_prompt": "You are a California labor law expert. Provide accurate, concise legal analysis."
  }
}
```

**Response**:
```json
{
  "model": "gemma3-legal:latest",
  "response": "California Labor Code § 1194 allows employees to recover unpaid wages through civil action. Key points:\n\n1. Employees can sue for wages, penalties, and attorney fees\n2. No prior demand required\n3. Statute of limitations: 3 years\n4. Liquidated damages available for willful violations...",
  "total_duration": 2.3,
  "prompt_eval_count": 45,
  "eval_count": 127
}
```

### **Tool 4: Document Classification**
```json
{
  "name": "classify_document",
  "arguments": {
    "text": "PLAINTIFF'S OPPOSITION TO MOTION TO DISMISS\n\nPlaintiff respectfully opposes defendant's motion to dismiss pursuant to Fed. R. Civ. P. 12(b)(6)..."
  }
}
```

**Response**:
```json
{
  "document_type": "legal_brief",
  "confidence": 0.8,
  "citation_count": 12,
  "primary_citation_types": ["federal_rule", "case_law", "us_statute"],
  "word_count": 3456
}
```

### **Tool 5: Citation Network Analysis**
```json
{
  "name": "analyze_citation_network",
  "arguments": {
    "text": "...(legal document with multiple citations)...",
    "max_depth": 2
  }
}
```

**Response**:
```json
{
  "total_citations": 45,
  "unique_types": 5,
  "highest_authority": ["ca_const", 1.0],
  "citation_density": 13.0,
  "top_citations": [
    {
      "type": "ca_const",
      "text": "CA Constitution Article I, Section 7",
      "authority_score": 1.0
    },
    ...
  ]
}
```

### **Tool 6: Health Check**
```json
{
  "name": "health_check",
  "arguments": {}
}
```

**Response**:
```json
{
  "mcp_server": "healthy",
  "web_scraping": "available",
  "rabbitmq": "connected",
  "ollama": "available",
  "available_models": [
    "gemma3-legal:latest",
    "embeddinggemma:latest"
  ],
  "timestamp": "2025-11-30T17:18:23.456789"
}
```

---

## 🔗 RabbitMQ Integration

### **Message Routing**
The MCP server publishes results to RabbitMQ queues for async processing:

| Queue | Message Type | Purpose |
|-------|--------------|---------|
| `web_scrape_results` | Web scraping results | Further processing, storage |
| `citation_extraction` | Citation analysis | Graph construction, indexing |
| `llm_analysis` | Gemma responses | Logging, monitoring |

### **Queue Message Format**
```json
{
  "task_type": "web_scrape",
  "timestamp": "2025-11-30T17:18:23.456789",
  "result": {
    "url": "https://example.com",
    "title": "Example Page",
    "content": "..."
  }
}
```

### **Consuming Messages (Optional)**
```python
import aio_pika
import asyncio

async def consume_results():
    connection = await aio_pika.connect_robust("amqp://guest:guest@localhost:5672/")
    channel = await connection.channel()

    queue = await channel.declare_queue("web_scrape_results", durable=True)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                data = json.loads(message.body)
                print(f"Received: {data['task_type']}")
                # Process data...

asyncio.run(consume_results())
```

---

## 🧪 Testing

### **Test All Tools**
```bash
# Install test dependency
pip install pytest pytest-asyncio

# Run tests
pytest test_gemma_legal_mcp.py -v
```

### **Manual Test**
```bash
# Start MCP server
python gemma3-legal-agentic-mcp.py

# In another terminal, send test request:
echo '{"jsonrpc":"2.0","method":"tool/call","params":{"name":"health_check","arguments":{}},"id":1}' | python gemma3-legal-agentic-mcp.py
```

---

## 📊 Citation Types Supported

| Type | Pattern | Authority Score | Example |
|------|---------|-----------------|---------|
| `ca_const` | California Constitution | 1.0 | CA Const. Art. I, § 1 |
| `ca_penal` | California Penal Code | 0.95 | CA Penal Code § 187 |
| `ca_labor` | California Labor Code | 0.90 | CA Labor Code § 1194 |
| `ca_civil` | California Civil Code | 0.90 | CA Civil Code § 1750 |
| `ca_ccp` | CA Code of Civil Procedure | 0.90 | CA CCP § 340 |
| `us_const` | US Constitution | 0.85 | US Const. Art. I, § 8 |
| `us_statute` | US Code | 0.80 | 42 U.S.C. § 1983 |
| `case_law` | Court cases | 0.75 | Brown v. Board, 347 U.S. 483 (1954) |
| `federal_rule` | Federal Rules | 0.70 | Fed. R. Civ. P. 12(b)(6) |
| `cfr` | Code of Federal Regulations | 0.65 | 29 C.F.R. § 541.300 |

---

## 🎭 Usage with Claude Desktop

### **Add to Claude Desktop Config**
Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gemma3-legal": {
      "command": "python",
      "args": [
        "C:/Users/james/Videos/deeds-web-app/mcp-servers/gemma3-legal-agentic-mcp.py"
      ],
      "env": {
        "RABBITMQ_URL": "amqp://guest:guest@localhost:5672/",
        "OLLAMA_ENDPOINT": "http://localhost:11434",
        "OLLAMA_MODEL": "gemma3-legal:latest"
      }
    }
  }
}
```

### **Restart Claude Desktop**
The gemma3-legal tools will now be available to Claude!

---

## 🔥 Advanced Usage

### **Chain Tools Together**
```
User: "Scrape the California Labor Code page for wage theft laws, extract all citations, and analyze them with gemma3-legal."

Claude will:
1. Call scrape_url("https://leginfo.legislature.ca.gov/...")
2. Call extract_citations(scraped_content)
3. Call analyze_with_gemma("Analyze these citations: ...")
4. Call analyze_citation_network(content)
```

### **Custom Prompts**
```
User: "Use gemma3-legal to draft a response to this motion citing California Labor Code § 1194."

Claude will:
1. Call analyze_with_gemma() with legal analysis context
2. Include citation extraction results
3. Format as legal brief
```

---

## 🐛 Troubleshooting

### **RabbitMQ Not Connecting**
```bash
# Check if RabbitMQ is running
docker ps | grep rabbitmq

# Check RabbitMQ logs
docker logs legal-ai-rabbitmq

# Test connection
curl http://localhost:15672
# Login: guest/guest
```

### **Ollama Not Found**
```bash
# Check Ollama status
systemctl status ollama  # Linux
# or
Get-Service Ollama  # Windows

# Pull gemma3-legal
ollama pull gemma3-legal:latest
```

### **Web Scraping Fails**
- Check internet connection
- Verify target site allows scraping
- Check `robots.txt` compliance

---

## 📝 License

MIT License - See LICENSE file

---

## 🚀 Next Steps

1. **Test the MCP server**: `python gemma3-legal-agentic-mcp.py`
2. **Add to Claude Desktop**: Update config file
3. **Try example queries**: "Scrape California labor law page and extract citations"
4. **Monitor RabbitMQ**: http://localhost:15672

---

**Built with**:
- 🐰 RabbitMQ 3.13
- 🦙 Ollama (gemma3-legal:latest)
- 🕷️ BeautifulSoup (5 existing implementations)
- ⚖️ CA Constitution citation patterns
- 🔧 FastMCP

**Contact**: Built for YoRHa Detective System - Legal AI Platform
