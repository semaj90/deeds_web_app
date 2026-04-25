Windows Redis quick setup

Project expects Redis on port 6379 by default. You have two options:

1. Local Windows Redis binary

- Download a Windows-compatible Redis distribution and place the `redis-server.exe` and
  `redis-cli.exe` under `../redis-latest/` relative to the repo root.
- Start with PowerShell:
  `Start-Process -NoNewWindow -FilePath './redis-latest/redis-server.exe' -ArgumentList '--port', '6379'`

2. Remote Redis / custom URL

- Set the environment variable `REDIS_URL` to point to your Redis instance, e.g.:

```powershell
$env:REDIS_URL = 'redis://localhost:6379'
```

3. Environment variables supported by code

- `REDIS_URL` (preferred) e.g. `redis://user:pass@host:6379`
- `REDIS_HOST` and `REDIS_PORT` are still accepted for compatibility

Notes

- The project consolidates to using `ioredis` across the frontend worker and cache modules. If you
  plan to run Redis locally for development use port 6379 to align with scripts and the dev
  orchestrator.
