**Example: nginx reverse-proxy for local memory API (TLS + Basic Auth)**

Purpose
- Protect an unauthenticated local service by putting a TLS+auth reverse proxy in front of it. Useful when you must expose the service to other local VMs or need an auth guard.

Notes
- This is an example only. For production-grade TLS+auth use Caddy (automatic certs) or a small OAuth proxy.
- Keep the proxy bound to localhost or your WSL interface; do NOT open to public networks.

Minimal nginx config (bind to localhost, basic auth)

1) Create password file (htpasswd; use nginx `htpasswd` utility or `openssl passwd -apr1`):

```bash
# install apache2-utils in WSL/Ubuntu: sudo apt install apache2-utils
htpasswd -c ./nginx-htpasswd claudeuser
```

2) nginx server block (example)

```
server {
  listen 127.0.0.1:8443 ssl;
  server_name localhost;

  ssl_certificate /etc/ssl/certs/local.crt;   # self-signed for dev or use Caddy for real certs
  ssl_certificate_key /etc/ssl/private/local.key;

  location /api/memory/claude-mem/ {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/nginx-htpasswd;

    proxy_pass http://127.0.0.1:5173/api/memory/claude-mem/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

3) Run (WSL) and use curl with `--user` and `--cacert` for tests:

```bash
curl -k --user claudeuser 'https://127.0.0.1:8443/api/memory/claude-mem' -d @sample.json
```

Alternatives
- Caddy: simpler TLS + basic auth setup (automatic certs for non-local deployments).
- Unix socket: if both proxy and service live on same host, proxy to a Unix socket and disallow TCP ports.

Reminder
- This only adds authentication at the proxy. The storage files and processes still need OS-level protections.
