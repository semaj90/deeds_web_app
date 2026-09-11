FROM node:22-bullseye-slim@sha256:5736fcf1f3f2109be7ef8aea0cbdf931804aee9a18c6760507b8ded078b25a9

# Install Python and build tools
RUN apt-get update && \
    apt-get install -y python3 python3-venv python3-pip build-essential curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /work

# Copy project files (we use bind-mount in CI/dev to avoid large image layers)
COPY . /work

# Install production JS deps (best-effort)
RUN npm ci --omit=dev || true

# Entrypoint runs the container's atlas runner script
COPY sveltekit-frontend/docker/entrypoint.sh /usr/local/bin/atlas-entrypoint.sh
RUN chmod +x /usr/local/bin/atlas-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/atlas-entrypoint.sh"]
