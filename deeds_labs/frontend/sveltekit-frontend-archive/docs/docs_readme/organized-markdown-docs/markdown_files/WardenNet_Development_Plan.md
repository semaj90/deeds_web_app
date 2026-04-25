### **WardenNet Development Plan (Revised)**

**Phase 1: Database Strategy & Migration (PostgreSQL & SQLite)**

1.  **Dual Database Setup**:
    *   **PostgreSQL**: Primary database for production deployment (Vercel).
    *   **SQLite**: Used for local development and bundled with the Tauri desktop application for offline functionality.
2.  **Update Drizzle Configuration**:
    *   Modify [`drizzle.config.ts`](drizzle.config.ts) to support both PostgreSQL and SQLite dialects. This might involve conditional configuration or separate config files if Drizzle's CLI doesn't natively support dual dialects for migrations. For initial scaffolding, we'll focus on SQLite for local development.
    *   Specify the local SQLite database file path (e.g., `sqlite.db`).
3.  **Update Database Client**:
    *   Adjust [`src/lib/server/db/index.ts`](src/lib/server/db/index.ts) to connect to SQLite using `drizzle-orm/better-sqlite3` for local development. A separate connection logic would be needed for PostgreSQL in a production environment.
4

### **Phase 2: Custom Authentication Implementation (SvelteKit Form Actions + bcrypt)**

1.  **Remove Auth.js Dependencies**: Remove `@auth/sveltekit` and any related configurations from `package.json` and relevant files.
2.  **Update `src/hooks.server.ts`**: Remove Auth.js `handle` and implement custom session management logic using SvelteKit's `sequence` helper for proper request handling.
3.  **Implement Hashing Utility**: Ensure [`src/lib/server/authUtils.ts`](src/lib/server/authUtils.ts) contains `hashPassword` and `verifyPassword` functions using `bcrypt`.
4.  **Login Page**:
    *   **[`src/routes/login/+page.svelte`](src/routes/login/+page.svelte)**: Create a login form with email and password fields, styled with Bootstrap (Dark mode preferred).
    *   **[`src/routes/login/+page.server.ts`](src/routes/login/+page.server.ts)**:
        *   Handle form submission using SvelteKit form actions.
        *   Validate credentials against the `users` table.
        *   Use `verifyPassword` to compare hashed passwords.
        *   On successful login, create a session by setting a secure, httpOnly cookie with a session token.
        *   Redirect to the dashboard (`/`).
        *   Handle login errors (e.g., invalid credentials).
5.  **Registration Page**:
    *   **[`src/routes/register/+page.svelte`](src/routes/register/+page.svelte)**: Create a registration form with name, email, and password fields, styled with Bootstrap.
    *   **[`src/routes/api/auth/register/+server.ts`](src/routes/api/auth/register/+server.ts)**: (Existing file, will be adapted)
        *   Handle form submission.
        *   Hash the password using `hashPassword`.
        *   Insert the new user into the `users` table with the specified roles (`warden`, `guard`, `public`).
        *   Handle duplicate email errors.
        *   On successful registration, return a success message or redirect.
6.  **Logout Logic (`src/routes/signout/+page.server.ts`)**:
    *   Clear the session cookie.
    *   Redirect to the login page.
7.  **Session Management Utility**: Create a new utility file (e.g., `src/lib/server/session.ts`) with functions to set, get, and invalidate user sessions using secure cookies. This will manage the session state.
8.  **Protected Routes**: Update [`src/routes/+layout.server.ts`](src/routes/+layout.server.ts) and other protected routes to check for an active session using the new session management utility and redirect unauthenticated users to `/login`.

### **Phase 3: Schema Design (Drizzle ORM) & AI/LLM Integration**

*   **`users` table**: Ensure `id`, `email`, `hashedPassword`, `role` (warden, guard, public) are correctly defined.
*   **`statutes` table**: `id`, `code`, `title`, `description`, `ai_summary`, `tags` (JSON[]), `embedding` (text).
*   **`crimes` table**: `id`, `title`, `severity`, `date`, `statute_id` (FK).
*   **`criminals` table**: `id`, `name`, `photo_url`, `conviction_status`, `threat_level`, etc.
*   **`cases` table**: `id`, `verdict`, `court_date`, `notes`, `criminal_id` (FK), `crime_ids` (FK[]).
*   **Semantic Tagging & Embedding**:
    *   Confirm `tags` are stored as JSON arrays in Drizzle.
    *   Confirm `embedding` is stored as `text` in Drizzle (e.g., `"[0.1,0.2,0.3]"`).
    *   **Qdrant Integration**: While Drizzle stores the embedding string, Qdrant will be used as the dedicated vector database for efficient similarity search. This implies a separate service or client-side integration to interact with Qdrant.
    *   Implement a JavaScript function for cosine similarity to compare embeddings (for client-side or server-side processing before/after Qdrant).
*   **Chat & Memory**:
    *   Store user chat history and case notes in the Drizzle-managed database, linked to users and cases.
    *   For local LLM (Ollama or Gemini), the SvelteKit API routes will be responsible for passing user chat history + case context as prompt memory to the LLM.

### **Phase 4: Tauri Integration**


2.  **Rust Authentication Crate**:
    *   Add `bcrypt` (or a similar hashing crate) to `src-tauri/Cargo.toml` for password verification.
    *   Create a Rust command `auth_login` in [`src-tauri/src/main.rs`](src-tauri/src/main.rs). This command will:
        *   Take username/email and password as arguments.
        *   Connect to the bundled postgres
        *   Retrieve the hashed password for the given user.
        *   Use the Rust `bcrypt` crate to verify the provided password against the stored hash.
        *   Return a success/failure status and potentially user role or a session token to the SvelteKit frontend.
3.  **SvelteKit-Tauri Communication**: Use `@tauri-apps/api/tauri` in SvelteKit to call the `auth_login` Rust command.

### **Phase 5: Route Implementation (Statute Management)**

1.  **Statute Form Page (`src/routes/statutes/manage/new/+page.svelte`)**:
    *   Create a Svelte component for the new statute form.
    *   Style with Bootstrap (Card, form fields, Dark mode preferred).
    *   Include fields for `code`, `title`, `description`, `tags` (input for comma-separated values, converted to JSON array), and `AI summary` (textarea).
    *   Implement form submission using SvelteKit form actions.
2.  **Statute Form Server Logic (`src/routes/statutes/manage/new/+page.server.ts`)**:
    *   Handle the form action.
    *   Parse form data, including converting the tags string to a JSON array.
    *   Insert data into the `statutes` table using Drizzle ORM.
    *   Implement `try/catch` for database errors.
    *   On successful insert, `throw redirect(302, "/statutes")`.

### **Phase 6: File Structure Review**

*   Confirm the proposed file structure aligns with the requirements:
    *   `src/lib/db.ts` (Drizzle client)
    *   `src/lib/schema.ts` (Drizzle ORM schema)
    *   `src/routes/index.svelte` (Dashboard view)
    *   `src/routes/statutes/+page.svelte` (Form page for new statute)
    *   `src/routes/statutes/+page.server.ts` (Handles form insert + redirect)
    *   `src/routes/login/` (Login page)
    *   `src/routes/api/` (REST or server-only endpoints)
    *   `src/components/` (Bootstrap cards, forms, modals)
    *   `src/assets/` (Icons, photos)
    *   `src-tauri/src/main.rs` (Tauri setup, commands, SQLite access)

---

### **Authentication Flow Diagram**

```mermaid
graph TD
    A[User enters credentials on Login Page] --> B{SvelteKit Form Action};
    B --> C[Call `login` action in `+page.server.ts`];
    C --> D[Call Rust `auth_login` command (Tauri)];
    D --> E[Rust: Connect to SQLite DB];
    E --> F[Rust: Retrieve hashed password];
    F --> G[Rust: Verify password with bcrypt];
    G -- Success --> H[Rust: Return success/user info];
    H --> I[SvelteKit: Set Session Cookie];
    I --> J[Redirect to Dashboard];
    G -- Failure --> K[Rust: Return error];
    K --> L[SvelteKit: Display Login Error];
```

### **Statute Creation Flow Diagram**

```mermaid
graph TD
    A[User fills out Statute Form] --> B{SvelteKit Form Action};
    B --> C[Call `createStatute` action in `+page.server.ts`];
    C --> D[Parse form data (e.g., tags to JSON array)];
    D --> E[Insert into `statutes` table via Drizzle ORM];
    E --> F{DB Insert Successful?};
    F -- Yes --> G[Redirect to /statutes];
    F -- No --> H[Handle DB Error];