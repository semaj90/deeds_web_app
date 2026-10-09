> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.firecrawl.dev/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.firecrawl.dev/introduction#content-area)

Firecrawl is the web data API for AI agents. Search, scrape, and interact with the live web to get clean Markdown or structured data.

## [​](https://docs.firecrawl.dev/introduction\#get-started)  Get started

### Set up Firecrawl MCP

Sign in via browser.

[See all setup options](https://docs.firecrawl.dev/mcp-server/oauth)

![](https://docs.firecrawl.dev/images/agent-clients/codex.svg)**ChatGPT & Codex** Install plugin![](https://docs.firecrawl.dev/images/agent-clients/claude-code.svg)**Claude & Claude Code** Install plugin![](https://docs.firecrawl.dev/images/agent-clients/cursor.svg)**Cursor** One click![](https://docs.firecrawl.dev/images/agent-clients/opencode.svg)**OpenCode** Copy config

Install the Firecrawl plugin, or use the command below for a direct MCP connection.

[![](https://docs.firecrawl.dev/images/agent-clients/codex.svg)Add to ChatGPT & Codex](https://chatgpt.com/plugins/plugin_asdk_app_6a314a73f8ac819195b0d55e36b9c609?q=firecrawl)

$`codex mcp add firecrawl --url https://mcp.firecrawl.dev/v2/mcp-oauth && codex mcp login firecrawl`

Copy

Then enter `/mcp` in Codex CLI and confirm **firecrawl** is connected.

Install the Firecrawl plugin, or use the command below for a direct MCP connection.

[![](https://docs.firecrawl.dev/images/agent-clients/claude-code.svg)Add to Claude & Claude Code](https://claude.com/plugins/firecrawl)

$`claude mcp add --transport http firecrawl https://mcp.firecrawl.dev/v2/mcp-oauth`

Copy

Then enter `/mcp` in Claude Code and complete the browser sign-in.

Install the hosted MCP server in one click, or copy the configuration below.

[![](https://docs.firecrawl.dev/images/agent-clients/cursor.svg)Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=firecrawl&config=eyJ1cmwiOiJodHRwczovL21jcC5maXJlY3Jhd2wuZGV2L3YyL21jcC1vYXV0aCJ9)

mcp.jsonCopy

```
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev/v2/mcp-oauth"
    }
  }
}
```

Open **Cursor Settings**, select **MCP**, and complete the Firecrawl sign-in.

Add this remote server configuration to your global or project config. OpenCode opens Firecrawl in your browser on first use.

opencode.jsonCopy

```
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://mcp.firecrawl.dev/v2/mcp-oauth",
      "enabled": true
    }
  }
}
```

Sign in and approve access, then confirm **firecrawl** is connected.

Using another MCP client? Point it at:

`https://mcp.firecrawl.dev/v2/mcp-oauth`

Copy

### [​](https://docs.firecrawl.dev/introduction\#build-directly-with-the-api)  Build directly with the API

Scrape your first page now. No account or API key is required for this request.

cURL

```
# No API key needed to get started — add -H "Authorization: Bearer $FIRECRAWL_API_KEY" for higher rate limits:
curl -s -X POST "https://api.firecrawl.dev/v2/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://firecrawl.dev",
    "formats": ["markdown", "html"]
  }'
```

Add an [API key](https://www.firecrawl.dev/app/api-keys) when you need higher limits. See the [Python SDK](https://docs.firecrawl.dev/sdks/python), [Node SDK](https://docs.firecrawl.dev/sdks/node), or [API reference](https://docs.firecrawl.dev/api-reference/endpoint/scrape) to build it into your application.

## [​](https://docs.firecrawl.dev/introduction\#other-ways-to-get-started)  Other ways to get started

### [​](https://docs.firecrawl.dev/introduction\#install-the-firecrawl-cli)  Install the Firecrawl CLI

One command installs the Firecrawl CLI, authenticates in your browser, and adds skills to every detected coding agent.

```
npx -y firecrawl-cli@latest init --all --browser
```

Restart your coding agent after setup so it can discover the new skills. See
[CLI](https://docs.firecrawl.dev/sdks/cli) for the full setup.

### [​](https://docs.firecrawl.dev/introduction\#set-up-with-an-agent)  Set up with an agent

Provide your agent with this Firecrawl setup prompt, or see [all MCP setup options](https://docs.firecrawl.dev/mcp-server).

Setup for agents

**For AI agents:** Use [llms.txt](https://docs.firecrawl.dev/llms.txt) for an index of the documentation, or [llms-full.txt](https://docs.firecrawl.dev/llms-full.txt) for the full text.

### [​](https://docs.firecrawl.dev/introduction\#build-and-test-directly)  Build and test directly

[**Get your API key** \\
\\
Create a free account for direct API access and higher limits](https://www.firecrawl.dev/app/api-keys)

[**Try it in the Playground** \\
\\
Test Firecrawl in the browser without writing code](https://www.firecrawl.dev/playground)

* * *

## [​](https://docs.firecrawl.dev/introduction\#what-can-firecrawl-do)  What can Firecrawl do?

[**Search** \\
\\
Search the web and get full page content from results](https://docs.firecrawl.dev/introduction#search)

[**Scrape** \\
\\
Extract content from any URL as markdown, HTML, or structured JSON](https://docs.firecrawl.dev/introduction#scrape)

[**Interact** \\
\\
Continue working with any scraped page: click, fill forms, extract dynamic\\
content](https://docs.firecrawl.dev/introduction#interact)

### [​](https://docs.firecrawl.dev/introduction\#why-firecrawl)  Why Firecrawl?

- **LLM-ready output**: Clean markdown, structured JSON, screenshots, and more.
- **Handles the hard stuff**: Proxies, anti-bot, JavaScript rendering, and dynamic content.
- **Reliable**: Built for production with high uptime and consistent results.
- **Fast**: Results in seconds, optimized for high throughput.
- **MCP Server**: Connect Firecrawl to any AI tool via the [Model Context Protocol](https://docs.firecrawl.dev/mcp-server).

Bounty: 5,000 credit reward for solid feedback on Alexandria

To qualify, complete a high-signal interview (thoughtful, concrete use cases, etc) with our Firecrawl Feedback Assistant. Only takes a few minutes, can be stopped at any time, and is both human/agent-friendly (just paste the link into your agentic harness!). Haven’t used Alexandria yet? Your take still counts.

[Start the interview](https://www.firecrawl.dev/survey/uilpn?src=docs-alexandria)

Include your email to be eligible. Interviews are reviewed for quality at the end of each week.

* * *

## [​](https://docs.firecrawl.dev/introduction\#search)  Search

Search the web and get full page content from results in one call. See the [Search feature docs](https://docs.firecrawl.dev/features/search) for all options.

Python

Node

cURL

CLI

```
from firecrawl import Firecrawl

firecrawl = Firecrawl(
  # No API key needed to get started — add one for higher rate limits:
  # api_key="fc-YOUR-API-KEY",
)

results = firecrawl.search(
    query="firecrawl",
    limit=3,
)
print(results)
```

```
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({
  // No API key needed to get started — add one for higher rate limits:
  // apiKey: "fc-YOUR-API-KEY",
});

const results = await firecrawl.search('firecrawl', {
  limit: 3,
  scrapeOptions: { formats: ['markdown'] }
});
console.log(results);
```

```
# No API key needed to get started — add -H "Authorization: Bearer $FIRECRAWL_API_KEY" for higher rate limits:
curl -s -X POST "https://api.firecrawl.dev/v2/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "firecrawl",
    "limit": 3
  }'
```

```
# Search the web
firecrawl search "firecrawl web scraping" --limit 5 --pretty
```

Response

SDKs will return the data object directly. cURL will return the complete payload.

JSON

```
{
  "success": true,
  "data": {
    "web": [\
      {\
        "url": "https://www.firecrawl.dev/",\
        "title": "Firecrawl - The Web Data API for AI",\
        "description": "The web crawling, scraping, and search API for AI. Built for scale. Firecrawl delivers the entire internet to AI agents and builders.",\
        "position": 1\
      },\
      {\
        "url": "https://github.com/firecrawl/firecrawl",\
        "title": "mendableai/firecrawl: Turn entire websites into LLM-ready ... - GitHub",\
        "description": "Firecrawl is an API service that takes a URL, crawls it, and converts it into clean markdown or structured data.",\
        "position": 2\
      },\
      ...\
    ],
    "images": [\
      {\
        "title": "Quickstart | Firecrawl",\
        "imageUrl": "https://mintlify.s3.us-west-1.amazonaws.com/firecrawl/logo/logo.png",\
        "imageWidth": 5814,\
        "imageHeight": 1200,\
        "url": "https://docs.firecrawl.dev/",\
        "position": 1\
      },\
      ...\
    ],
    "news": [\
      {\
        "title": "Y Combinator startup Firecrawl is ready to pay $1M to hire three AI agents as employees",\
        "url": "https://techcrunch.com/2025/05/17/y-combinator-startup-firecrawl-is-ready-to-pay-1m-to-hire-three-ai-agents-as-employees/",\
        "snippet": "It's now placed three new ads on YC's job board for “AI agents only” and has set aside a $1 million budget total to make it happen.",\
        "date": "3 months ago",\
        "position": 1\
      },\
      ...\
    ]
  }
}
```

## [​](https://docs.firecrawl.dev/introduction\#scrape)  Scrape

Scrape any URL and get its content in markdown, HTML, or other formats. See the [Scrape feature docs](https://docs.firecrawl.dev/features/scrape) for all options.

Python

Node

cURL

CLI

```
from firecrawl import Firecrawl

firecrawl = Firecrawl(
  # No API key needed to get started — add one for higher rate limits:
  # api_key="fc-YOUR-API-KEY",
)

# Scrape a website:
doc = firecrawl.scrape("https://firecrawl.dev", formats=["markdown", "html"])
print(doc)
```

```
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({
  // No API key needed to get started — add one for higher rate limits:
  // apiKey: "fc-YOUR-API-KEY",
});

// Scrape a website:
const doc = await firecrawl.scrape('https://firecrawl.dev', { formats: ['markdown', 'html'] });
console.log(doc);
```

```
# No API key needed to get started — add -H "Authorization: Bearer $FIRECRAWL_API_KEY" for higher rate limits:
curl -s -X POST "https://api.firecrawl.dev/v2/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://firecrawl.dev",
    "formats": ["markdown", "html"]
  }'
```

```
# Scrape a URL and get markdown
firecrawl https://firecrawl.dev

# With multiple formats (returns JSON)
firecrawl https://firecrawl.dev --format markdown,html,links --pretty
```

Response

SDKs will return the data object directly. cURL will return the payload exactly as shown below.

```
{
  "success": true,
  "data" : {
    "markdown": "Launch Week I is here! [See our Day 2 Release 🚀](https://www.firecrawl.dev/blog/launch-week-i-day-2-doubled-rate-limits)[💥 Get 2 months free...",\
    "html": "<!DOCTYPE html><html lang=\"en\" class=\"light\" style=\"color-scheme: light;\"><body class=\"__variable_36bd41 __variable_d7dc5d font-inter ...",\
    "metadata": {\
      "title": "Home - Firecrawl",\
      "description": "Firecrawl crawls and converts any website into clean markdown.",\
      "language": "en",\
      "keywords": "Firecrawl,Markdown,Data,Mendable,Langchain",\
      "robots": "follow, index",\
      "ogTitle": "Firecrawl",\
      "ogDescription": "Turn any website into LLM-ready data.",\
      "ogUrl": "https://www.firecrawl.dev/",\
      "ogImage": "https://www.firecrawl.dev/og.png?123",\
      "ogLocaleAlternate": [],\
      "ogSiteName": "Firecrawl",\
      "sourceURL": "https://firecrawl.dev",\
      "statusCode": 200,\
      "contentType": "text/html"\
    }\
  }\
}\
```\
\
## [​](https://docs.firecrawl.dev/introduction\#interact)  Interact\
\
Scrape a page, then keep working with it: click buttons, fill forms, extract dynamic content, or navigate deeper. Describe what you want in plain English or write code for full control. See the [Interact feature docs](https://docs.firecrawl.dev/features/interact) for all options.\
\
Python\
\
Node\
\
cURL\
\
CLI\
\
```\
from firecrawl import Firecrawl\
\
app = Firecrawl(\
  # No API key needed to get started — add one for higher rate limits:\
  # api_key="fc-YOUR-API-KEY",\
)\
\
# 1. Scrape Amazon's homepage\
result = app.scrape("https://www.amazon.com", formats=["markdown"])\
scrape_id = result.metadata.scrape_id\
\
# 2. Interact — search for a product and get its price\
app.interact(scrape_id, prompt="Search for iPhone 16 Pro Max")\
response = app.interact(scrape_id, prompt="Click on the first result and tell me the price")\
print(response.output)\
\
# 3. Stop the session\
app.stop_interaction(scrape_id)\
```\
\
```\
import { Firecrawl } from 'firecrawl';\
\
const app = new Firecrawl({\
  // No API key needed to get started — add one for higher rate limits:\
  // apiKey: 'fc-YOUR-API-KEY',\
});\
\
// 1. Scrape Amazon's homepage\
const result = await app.scrape('https://www.amazon.com', { formats: ['markdown'] });\
const scrapeId = result.metadata?.scrapeId;\
\
// 2. Interact — search for a product and get its price\
await app.interact(scrapeId, { prompt: 'Search for iPhone 16 Pro Max' });\
const response = await app.interact(scrapeId, { prompt: 'Click on the first result and tell me the price' });\
console.log(response.output);\
\
// 3. Stop the session\
await app.stopInteraction(scrapeId);\
```\
\
```\
# 1. Scrape Amazon's homepage\
# No API key needed to get started — add -H "Authorization: Bearer $FIRECRAWL_API_KEY" for higher rate limits:\
RESPONSE=$(curl -s -X POST "https://api.firecrawl.dev/v2/scrape" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://www.amazon.com", "formats": ["markdown"]}')\
\
SCRAPE_ID=$(echo $RESPONSE | jq -r '.data.metadata.scrapeId')\
\
# 2. Interact — search for a product and get its price\
curl -s -X POST "https://api.firecrawl.dev/v2/scrape/$SCRAPE_ID/interact" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Search for iPhone 16 Pro Max"}'\
\
curl -s -X POST "https://api.firecrawl.dev/v2/scrape/$SCRAPE_ID/interact" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Click on the first result and tell me the price"}'\
\
# 3. Stop the session\
curl -s -X DELETE "https://api.firecrawl.dev/v2/scrape/$SCRAPE_ID/interact"\
```\
\
```\
# 1. Scrape Amazon's homepage (scrape ID is saved automatically)\
firecrawl scrape https://www.amazon.com\
\
# 2. Interact — search for a product and get its price\
firecrawl interact "Search for iPhone 16 Pro Max"\
firecrawl interact "Click on the first result and tell me the price"\
\
# 3. Stop the session\
firecrawl interact stop\
```\
\
Response\
\
Response\
\
```\
{\
  "success": true,\
  "cdpUrl": "wss://browser.firecrawl.dev/...",\
  "liveViewUrl": "https://liveview.firecrawl.dev/...",\
  "interactiveLiveViewUrl": "https://liveview.firecrawl.dev/...",\
  "output": "The iPhone 16 Pro Max (256GB) is priced at $1,199.00.",\
  "exitCode": 0,\
  "killed": false\
}\
```\
\
* * *\
\
## [​](https://docs.firecrawl.dev/introduction\#more-capabilities)  More capabilities\
\
[**Agent** \\
\\
Autonomous web data gathering powered by AI](https://docs.firecrawl.dev/features/agent)\
\
[**Interact** \\
\\
Click, fill forms, extract dynamic content](https://docs.firecrawl.dev/features/interact)\
\
[**Webhooks** \\
\\
Async event delivery](https://docs.firecrawl.dev/webhooks)\
\
[**Browser Sandbox** \\
\\
Managed browser sessions for interactive workflows](https://docs.firecrawl.dev/features/browser)\
\
[**Parse** \\
\\
Turn local PDFs, DOCX, XLSX, HTML, and more into Markdown or structured JSON](https://docs.firecrawl.dev/features/parse)\
\
[**Map** \\
\\
Discover all URLs on a website](https://docs.firecrawl.dev/features/map)\
\
[**Crawl** \\
\\
Recursively gather content from entire sites](https://docs.firecrawl.dev/features/crawl)\
\
* * *\
\
## [​](https://docs.firecrawl.dev/introduction\#resources)  Resources\
\
[**API Reference** \\
\\
Complete API documentation with interactive examples](https://docs.firecrawl.dev/api-reference/v2-introduction)\
\
[**SDKs** \\
\\
Python, Node.js, CLI, and community SDKs](https://docs.firecrawl.dev/sdks/overview)\
\
[**Open Source** \\
\\
Self-host Firecrawl or contribute to the project](https://docs.firecrawl.dev/contributing/open-source-or-cloud)\
\
[**Integrations** \\
\\
LangChain, LlamaIndex, OpenAI, and more](https://docs.firecrawl.dev/developer-guides/llm-sdks-and-frameworks/openai)\
\
[Suggest edits](https://github.com/firecrawl/firecrawl-docs/edit/main/introduction.mdx) [Raise issue](https://github.com/firecrawl/firecrawl-docs/issues/new?title=Issue%20on%20docs&body=Path:%20/introduction)\
\
✕