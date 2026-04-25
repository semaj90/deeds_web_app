# Step-by-Step Setup Guide: Prosecutor Desktop App (SvelteKit + Rust Tauri + Postgres + Drizzle + Qdrant + Python NLP)

## 1. Database Initialization (Postgres)
- Use the provided `db/init/01-init.sql` to initialize your database.
- This script:
  - Enables required extensions (`uuid-ossp`, `pg_trgm`, `btree_gin`).
  - (Optionally) enables `pgvector` for AI embeddings.
  - Creates two roles: `prosecutor_readonly` (for reporting) and `prosecutor_app` (for the app).
  - Grants schema and table privileges for secure access.
  - Sets timezone to UTC.
  - Adds performance tuning (e.g., `pg_stat_statements`).

**How to use:**
- Start your Postgres container (via Docker Compose or manually).
- Run the script:
  ```sh
  psql -U postgres -d prosecutor_app -f db/init/01-init.sql
  ```

---

## 2. Run Drizzle Migrations
- Place your Drizzle migration scripts in the `drizzle/` directory.
- Run migrations to create tables and indexes after DB init.

---

## 3. Start Qdrant (Vector DB)
- Use Docker Compose to start Qdrant for semantic search and embeddings.
- Make sure the Qdrant port does not conflict with other services.

---

## 4. Start Python NLP Service
- Set up your Python NLP microservice (e.g., FastAPI).
- Install dependencies:
  ```sh
  pip install -r requirements.txt
  ```
- Start the service:
  ```sh
  uvicorn main:app
  ```

---

## 5. Build and Run the Rust (Tauri) Backend
- Build your Tauri backend:
  ```sh
  cargo build  # (in src-tauri)
  ```
- The backend exposes commands for CRUD, LLM upload/inference, and more.

---

## 6. Install Frontend Dependencies
- In `web-app/sveltekit-frontend`, run:
  ```sh
  npm install
  ```

---

## 7. Run the Desktop App
- From the SvelteKit frontend directory, run:
  ```sh
  npm run tauri dev
  ```
- This launches the SvelteKit UI in a Tauri desktop window, connected to your Rust backend.

---

## 8. Upload and Use LLMs
- Use the SvelteKit UI to upload LLM models (via the Tauri file picker).
- Run inference locally using the uploaded models.

---

## Best Practices & Tips
- **Security:** Never expose your DB or Qdrant ports to the public. Use strong passwords and SSL in production.
- **Separation of Concerns:** Keep business logic in Rust, UI in SvelteKit, and heavy NLP in Python.
- **Testing:** Use Playwright for E2E tests and Rust unit tests for backend logic.
- **Performance:** Use DB indexes and `pg_stat_statements` for tuning. Use Qdrant for fast semantic search.
- **Extensibility:** Add more Tauri commands for new features. Use SvelteKit stores for state management.

---

## Summary
This workflow gives you a secure, modern, and extensible desktop legal app with full AI and database support.

Let me know if you want code samples for any specific integration or advanced workflow!
