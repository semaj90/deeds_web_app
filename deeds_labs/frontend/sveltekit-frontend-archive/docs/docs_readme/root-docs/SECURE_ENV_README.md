# Secure Environment Variable Management

This document outlines the process for managing environment variables securely within the Legal AI Platform.

## 🚨 **NEVER COMMIT `.env` FILES TO GIT** 🚨

The `.env` file contains sensitive credentials and should never be part of the version control history. The `.gitignore` file should contain a line for `.env*` to prevent accidental commits of these files.

## Quick Start

1.  **Copy the example file:** It's a best practice to have a `.env.example` file in the repository. If one exists, copy it to start.
    ```bash
    cp .env.example .env
    ```
2.  **Fill in the values:** Open the newly created `.env` file and replace the placeholder values with your local development credentials.

## Environment Variables

The project uses a `.env` file in the root of `sveltekit-frontend` to manage environment variables for local development.

### Core

*   `DATABASE_URL`: The connection string for the PostgreSQL database.
    *   Example: `postgresql://legal_admin:123456@localhost:5434/legal_ai_db`
*   `LUCIA_SECRET`: A long, random string used for signing session cookies.
    *   Generate one with: `openssl rand -base64 32`

### External Services

*   `OLLAMA_ENDPOINT`: URL for the Ollama service.
    *   Default: `http://localhost:11434`
*   `REDIS_URL`: Connection string for Redis.
    *   Example: `redis://:redis@localhost:6379/0`
*   `MINIO_ENDPOINT`: MinIO server endpoint (e.g., `localhost`).
*   `MINIO_PORT`: MinIO server port (e.g., `9000`).
*   `MINIO_ACCESS_KEY`: MinIO access key.
*   `MINIO_SECRET_KEY`: MinIO secret key.
*   `RABBITMQ_URL`: AMQP connection string for RabbitMQ.
    *   Example: `amqp://legal_admin:123456@localhost:5672`

### SvelteKit Public Variables

Variables that need to be exposed to the browser **must** be prefixed with `PUBLIC_`.

*   `PUBLIC_APP_NAME`: The public name of the application.
    *   Example: `PUBLIC_APP_NAME="Legal AI Platform"`

## Using Environment Variables in SvelteKit

SvelteKit provides two modules for accessing environment variables:

1.  **Server-side only (`$env/static/private`):** For sensitive variables that should never be exposed to the client.
    ```typescript
    import { DATABASE_URL } from '$env/static/private';

    // Now you can use DATABASE_URL in your server-side code.
    ```

2.  **Public (`$env/static/public`):** For variables that are safe to be included in the client-side bundle. These **must** be prefixed with `PUBLIC_` in your `.env` file.
    ```typescript
    import { PUBLIC_APP_NAME } from '$env/static/public';

    // This can be used in Svelte components and client-side logic.
    ```

## Production Environment

In production environments (e.g., Docker, Vercel, Netlify), these variables should be set through the hosting provider's dashboard or a secrets management system, **not** through a `.env` file committed to the repository.
