[Skip to content](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md) to refresh your session.Dismiss alert

{{ message }}

## Collapse file tree

## Files

View file on default branch

8239c68

Search this repository(forward slash)` forward slash/`

/

# api-quickstart.md

Copy path

Blame

More file actions

Blame

More file actions

## Latest commit

[![LearningCircuit](https://avatars.githubusercontent.com/u/185559241?v=4&size=40)](https://github.com/LearningCircuit)[LearningCircuit](https://github.com/LearningCircuit/local-deep-research/commits?author=LearningCircuit)

[fix: unify SettingsManagers, fix env var bugs (](https://github.com/LearningCircuit/local-deep-research/commit/7d8fdee7dd849e8e45f9f71b635440879cc1fa8a) [#2070](https://github.com/LearningCircuit/local-deep-research/pull/2070) [)](https://github.com/LearningCircuit/local-deep-research/commit/7d8fdee7dd849e8e45f9f71b635440879cc1fa8a)

Open commit detailsfailure

8 months agoFeb 11, 2026

[7d8fdee](https://github.com/LearningCircuit/local-deep-research/commit/7d8fdee7dd849e8e45f9f71b635440879cc1fa8a) · 8 months agoFeb 11, 2026

## History

[History](https://github.com/LearningCircuit/local-deep-research/commits/8239c688206976926752ddfda8a76d9362a3e021/docs/api-quickstart.md)

Open commit details

[View commit history for this file.](https://github.com/LearningCircuit/local-deep-research/commits/8239c688206976926752ddfda8a76d9362a3e021/docs/api-quickstart.md) History

231 lines (172 loc) · 6.46 KB

· Code owner: @elpikola, @LearningCircuit, and @djpetti

/

# api-quickstart.md

Copy path

Top

## File metadata and controls

- Preview

- Code

- Blame


231 lines (172 loc) · 6.46 KB

· Code owner: @elpikola, @LearningCircuit, and @djpetti

[Raw](https://github.com/LearningCircuit/local-deep-research/raw/8239c688206976926752ddfda8a76d9362a3e021/docs/api-quickstart.md)

Copy raw file

Download raw file

Outline

Edit and raw actions

# API Quick Start

[Permalink: API Quick Start](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#api-quick-start)

## Overview

[Permalink: Overview](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#overview)

Local Deep Research provides both HTTP REST API and programmatic Python API access. Since version 1.0, authentication is required for all API endpoints, and the system uses per-user encrypted databases.

## Simplest Usage - Python Client

[Permalink: Simplest Usage - Python Client](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#simplest-usage---python-client)

The easiest way to use the API is with the built-in client that handles all authentication complexity:

```
from local_deep_research.api import LDRClient, quick_query

# One-liner for quick research
summary = quick_query("username", "password", "What is DNA?")
print(summary)

# Or use the client for multiple operations
client = LDRClient()
client.login("username", "password")
result = client.quick_research("What is machine learning?")
print(result["summary"])
```

No need to worry about CSRF tokens, HTML parsing, or session management!

## Authentication

[Permalink: Authentication](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#authentication)

### Web UI Authentication

[Permalink: Web UI Authentication](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#web-ui-authentication)

The API requires authentication through the web interface first:

1. Start the server:



```
python -m local_deep_research.web.app
```

2. Open [http://localhost:5000](http://localhost:5000/) in your browser

3. Register a new account or login

4. Your session cookie will be used for API authentication


### HTTP API Authentication

[Permalink: HTTP API Authentication](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#http-api-authentication)

For HTTP API requests, you need to:

1. First authenticate through the login endpoint
2. Include the session cookie in subsequent requests
3. Include CSRF token for state-changing operations

Example authentication flow:

```
import requests
from bs4 import BeautifulSoup

# Create a session to persist cookies
session = requests.Session()

# 1. Get login page and extract CSRF token for login
login_page = session.get("http://localhost:5000/auth/login")
soup = BeautifulSoup(login_page.text, 'html.parser')
csrf_input = soup.find('input', {'name': 'csrf_token'})
login_csrf = csrf_input.get('value') if csrf_input else None

# 2. Login with form data (not JSON) including CSRF
login_response = session.post(
    "http://localhost:5000/auth/login",
    data={
        "username": "your_username",
        "password": "your_password",
        "csrf_token": login_csrf
    }
)

if login_response.status_code in [200, 302]:
    print("Login successful")
    # Session cookie is automatically stored
else:
    print(f"Login failed: {login_response.text}")

# 3. Get CSRF token for API requests
csrf_response = session.get("http://localhost:5000/auth/csrf-token")
csrf_token = csrf_response.json()["csrf_token"]

# 4. Make API requests with CSRF header
headers = {"X-CSRF-Token": csrf_token}
api_response = session.post(
    "http://localhost:5000/api/start_research",
    json={
        "query": "What is quantum computing?",
        "model": "gpt-3.5-turbo",
        "search_engines": ["searxng"],
    },
    headers=headers
)
```

## Programmatic API Access

[Permalink: Programmatic API Access](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#programmatic-api-access)

The programmatic API now requires a settings snapshot for proper context:

```
from local_deep_research.api import quick_summary
from local_deep_research.settings import SettingsManager
from local_deep_research.database.session_context import get_user_db_session

# Get user session and settings
with get_user_db_session(username="your_username", password="your_password") as session:
    settings_manager = SettingsManager(session)
    settings_snapshot = settings_manager.get_all_settings()

    # Use the API with settings snapshot
    result = quick_summary(
        query="What is machine learning?",
        settings_snapshot=settings_snapshot,
        iterations=2,
        questions_per_iteration=3
    )

    print(result["summary"])
```

## API Endpoints

[Permalink: API Endpoints](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#api-endpoints)

### Research Endpoints

[Permalink: Research Endpoints](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#research-endpoints)

Research endpoints are under `/api/`:

- `POST /api/start_research` \- Start new research
- `GET /api/research/{id}/status` \- Check research status
- `GET /api/report/{id}` \- Get research results
- `POST /api/terminate/{id}` \- Stop running research

### Settings Endpoints

[Permalink: Settings Endpoints](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#settings-endpoints)

Settings endpoints are under `/settings/api/`:

- `GET /settings/api` \- Get all settings
- `GET /settings/api/{key}` \- Get specific setting
- `PUT /settings/api/{key}` \- Update setting
- `GET /settings/api/available-models` \- Get available LLM providers
- `GET /settings/api/available-search-engines` \- Get search engines

### History Endpoints

[Permalink: History Endpoints](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#history-endpoints)

- `GET /history/api` \- Get research history
- `GET /history/api/{id}` \- Get specific research details

## Important Changes from v1.x

[Permalink: Important Changes from v1.x](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#important-changes-from-v1x)

1. **Authentication Required**: All API endpoints now require authentication
2. **Settings Snapshot**: Programmatic API calls need settings\_snapshot parameter
3. **Per-User Databases**: Each user has their own encrypted database
4. **CSRF Protection**: State-changing requests require CSRF token
5. **New Endpoint Structure**: Research APIs are under `/api/` (e.g., `/api/start_research`)

## Example: Complete Research Flow

[Permalink: Example: Complete Research Flow](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#example-complete-research-flow)

```
import requests
import time

# Setup session and login
session = requests.Session()
session.post(
    "http://localhost:5000/auth/login",
    json={"username": "user", "password": "pass"}
)

# Get CSRF token
csrf = session.get("http://localhost:5000/auth/csrf-token").json()["csrf_token"]
headers = {"X-CSRF-Token": csrf}

# Start research
research = session.post(
    "http://localhost:5000/api/start_research",
    json={
        "query": "Latest advances in quantum computing",
        "model": "gpt-3.5-turbo",
        "search_engines": ["arxiv", "wikipedia"],
        "iterations": 3
    },
    headers=headers
).json()

research_id = research["research_id"]

# Poll for results
while True:
    status = session.get(
        f"http://localhost:5000/api/research/{research_id}/status"
    ).json()

    if status["status"] in ["completed", "failed"]:
        break

    print(f"Progress: {status.get('progress', 'unknown')}")
    time.sleep(5)

# Get final results
results = session.get(
    f"http://localhost:5000/api/report/{research_id}"
).json()

print(f"Summary: {results['summary']}")
print(f"Sources: {len(results['sources'])}")
```

## Rate Limiting

[Permalink: Rate Limiting](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#rate-limiting)

The API includes adaptive rate limiting:

- Default: 60 requests per minute per user
- Automatic retry with exponential backoff
- Rate limits are per-user, not per-IP

## Error Handling

[Permalink: Error Handling](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#error-handling)

Common error responses:

- `401`: Not authenticated - login required
- `403`: CSRF token missing or invalid
- `404`: Resource not found
- `429`: Rate limit exceeded
- `500`: Server error

Always check response status and handle errors appropriately.

## Next Steps

[Permalink: Next Steps](https://github.com/LearningCircuit/local-deep-research/blob/8239c68/docs/api-quickstart.md#next-steps)

- See [examples/api\_usage](https://github.com/LearningCircuit/local-deep-research/blob/8239c688206976926752ddfda8a76d9362a3e021/examples/api_usage) for complete examples
- Check [docs/CUSTOM\_LLM\_INTEGRATION.md](https://github.com/LearningCircuit/local-deep-research/blob/8239c688206976926752ddfda8a76d9362a3e021/docs/CUSTOM_LLM_INTEGRATION.md) for custom LLM setup
- Read [docs/LANGCHAIN\_RETRIEVER\_INTEGRATION.md](https://github.com/LearningCircuit/local-deep-research/blob/8239c688206976926752ddfda8a76d9362a3e021/docs/LANGCHAIN_RETRIEVER_INTEGRATION.md) for custom retrievers

You can’t perform that action at this time.