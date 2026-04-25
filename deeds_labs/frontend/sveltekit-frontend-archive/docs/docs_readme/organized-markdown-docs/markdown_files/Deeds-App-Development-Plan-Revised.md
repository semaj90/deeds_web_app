## Detailed Development Plan for Deeds-App

This plan outlines the architecture, components, and implementation strategies for building a modern, high-fidelity SvelteKit web application with social network-like features, desktop exportability via Tauri/Rust, and potential Flutter integration.

### 1. Core Web Application Components & Aesthetic

The goal is a very high-resolution and polished UI/UX design with a modern, sleek look, mimicking Unreal Engine's visual fidelity through advanced CSS and subtle WebGL enhancements. Bootstrap will be used as the primary CSS framework, customized to achieve the desired aesthetic.

**Component List:**

*   **Layout Components:**
    *   [`+Layout.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/+layout.svelte): Main application layout, including header, sidebar, and main content area.
    *   [`+Header.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+Header.svelte): Navigation bar with logo, user profile link, and global search.
    *   [`+Sidebar.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+Sidebar.svelte): Collapsible navigation for main sections (Dashboard, Cases, Profile, etc.).
    *   **Footer Component:** Standard footer with copyright and links.
*   **Authentication & User Components:**
    *   **Registration Form:** User input fields for username, email, password, and confirmation.
    *   **Login Form:** User input fields for username/email and password.
    *   **User Profile Page:** Displays user information, editable fields, and a section for user-created cases.
    *   **Profile Picture Uploader:** Component for uploading and displaying user avatars.
*   **Case (Post) Management Components:**
    *   [`+CaseCard.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+CaseCard.svelte): Displays a summary of a case (title, tags, author, date, snippet).
    *   **Case List/Feed:** Displays a collection of `CaseCard` components, with pagination/infinite scroll.
    *   **Case Detail Page:** Full view of a single case, including description, associated evidence, and comments.
    *   [`+MarkdownEditor.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+MarkdownEditor.svelte): Rich text editor for creating/editing case descriptions (potentially integrating Toast UI Editor as seen in `package.json`).
    *   **Tag Input Component:** For adding and displaying tags associated with cases.
    *   [`+EvidenceUpload.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+EvidenceUpload.svelte) / [`+FileUploadSection.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+FileUploadSection.svelte): Components for uploading files related to cases.
*   **Search & Discovery Components:**
    *   [`+SearchBar.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+SearchBar.svelte): Global search input with autocomplete/suggestions.
    *   **Filter/Sort Options:** Components for refining search results (by tags, date, author).
*   **Interactive Canvas & LLM Integration Components:**
    *   **Interactive Canvas:** A visual interface for describing cases, potentially using drag-and-drop elements (`DropZone.svelte`, `DraggableItem.svelte`).
    *   **LLM Response Display:** Area to show LLM-generated content, potentially with a typewriter effect.
    *   **3D Model Viewer (Live2D/OBJ):** Svelte component integrating Three.js to display 3D models that "output" LLM responses.
*  (Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+Modal.svelte): Reusable modal dialogs.
    *   [`+Dropdown.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+Dropdown.svelte): Custom dropdown menus.
    *   [`+Checkbox.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/lib/components/+Checkbox.svelte): Custom checkboxes.
    *   **Buttons, Forms, Alerts:** Standard bits-ui, melt-ui components with custom styling.

**Aesthetic Implementation:**

*   **Advanced CSS:** Extensive use of CSS variables for theming, custom properties for shadows, gradients, and complex layouts. CSS animations and transitions for smooth UI interactions.
*   **Bootstrap Customization:** Overriding Bootstrap's default SCSS variables and creating custom themes to achieve the "Unreal-like" sleek, high-resolution look. This includes custom components that leverage Bootstrap's grid and utility classes.
*   **Subtle WebGL Enhancements:** For elements like background effects, particle systems, or interactive visual flourishes, WebGL (via Three.js) will be used sparingly to enhance the aesthetic without compromising performance. This will be particularly relevant for the 3D model viewer.

### 2. Social Network Account Features

This section details the implementation of core social network functionalities.

*   **User Registration:**
    *   **Frontend:** [`register/+page.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/register/+page.svelte) will handle user input and form validation.
    *   **Backend:** [`api/auth/register/+server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/api/auth/register/+server.ts) will handle user creation, password hashing (using `bcrypt` or `@node-rs/argon2` as per `package.json`), and session management (using Lucia as per `package.json`).
*   **User Login/Authentication:**
    *   **Frontend:** [`login/+page.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/login/+page.svelte) for credentials input.
    *   **Backend:** [`api/auth/[...auth]/+server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/api/auth/[...auth]/+server.ts) and [`api/auth/callback/credentials/+server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/api/auth/callback/credentials/+server.ts) will manage authentication flow, session creation, and user validation.
*   **Account Profile:**
    *   **Frontend:** [`profile/+page.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/profile/+page.svelte) and [`account/+page.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/account/+page.svelte) will display and allow editing of user details.
    *   **Backend:** [`api/profile/+server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/api/profile/+server.ts) will provide API endpoints for fetching and updating user data.
*   **Creating Cases (Posts):**
    *   **Frontend:** [`cases/new/+page.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/cases/new/+page.svelte) will provide the form for creating new cases, leveraging the `+MarkdownEditor.svelte` and file upload components.
    *   **Backend:** [`cases/new/+page.server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/cases/new/+page.server.ts) and [`api/cases/+server.ts`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/api/cases/+server.ts) will handle data submission, validation, and storage in the Drizzle ORM database.
*   **Searching Cases by ID and Tags (Qdrant Integration):**
    *   **Frontend:** The `+SearchBar.svelte` will be enhanced to allow searching by case ID and tags.
    *   **Backend:**
        *   When a case is created or updated, its content (description, tags) will be sent to a Qdrant instance for vector embedding and indexing. This will likely involve a new API endpoint (e.g., `api/content-embeddings/+server.ts` already exists, which is a good starting point).
        *   Search queries will be sent to a backend endpoint (e.g., `api/cases/+server.ts` or a new `api/search/+server.ts`) which will then query Qdrant for relevant case IDs based on vector similarity (for tag/content search) or direct ID lookup.
        *   The backend will then fetch the full case details from the primary database using the IDs returned by Qdrant.

### 3. SvelteKit SSR, Routing, Layouts, and HTTP Caching

SvelteKit's architecture naturally supports SSR, routing, and layouts.

*   **SSR (Server-Side Rendering):** SvelteKit handles SSR by default, rendering pages on the server before sending them to the client. This improves initial load times and SEO.
*   **Routing:** The existing file-system based routing in `src/routes` will be utilized.
    *   `+page.svelte`: Defines the main page component for a route.
    *   `+page.server.ts`: Handles server-side data loading and form actions for a route, ensuring data is fetched before the page is rendered.
    *   `+page.ts`: Handles universal data loading (both server and client) for a route.
    *   `+server.ts`: Defines API endpoints for specific routes.
*   **Layouts:**
    *   [`+layout.svelte`](Deeds-App-doesn-t-work--main/web-app/sveltekit-frontend/src/routes/+layout.svelte): The main layout will wrap all pages, providing consistent navigation (header, sidebar) and styling.
    *   Nested layouts can be used for specific sections (e.g., `/dashboard/+layout.svelte`) to apply different UI structures.
*   **HTTP Caching:**
    *   SvelteKit allows setting HTTP caching headers in `+server.ts` files or `+page.server.ts` `load` functions.
    *   For static assets (CSS, JS, images), the build process will handle cache-busting.
    *   For dynamic data, appropriate `Cache-Control` headers (e.g., `max-age`, `s-maxage`, `stale-while-revalidate`) will be set based on data freshness requirements.
    *   The existing `src/lib/server/cache/cache.ts` and `src/lib/server/cache/loki.ts` indicate an existing caching mechanism that can be leveraged and extended.

### 4. Tauri and Rust Exportability

Tauri allows building cross-platform desktop applications using web technologies.

*   **WebView Integration:** Tauri uses a WebView (e.g., WebView2 on Windows, WebKit on macOS) to render the SvelteKit frontend. The SvelteKit application will run within this WebView.
*   **Tauri API for Rust Backend:**
    *   The `package.json` already lists `@tauri-apps/api`, indicating Tauri is set up.
    *   Rust will be used for backend logic that requires native system access, performance-critical operations, or direct interaction with local resources (e.g., local LLM inference, file system operations beyond what the browser allows).
    *   SvelteKit's API routes (`+server.ts`) can communicate with the Rust backend via Tauri's IPC (Inter-Process Communication) layer. This means the SvelteKit frontend will make calls to JavaScript functions exposed by Tauri, which in turn call Rust functions.
*   **Build Process:** The Tauri build process will bundle the SvelteKit production build (`npm run build`) along with the Rust backend into a single executable.

### 5. Flutter Integration

Flutter can be used for native mobile applications (iOS/Android) that share backend logic with the SvelteKit web app.

*   **Shared Backend:** The existing SvelteKit API routes (`src/routes/api`) can serve as the backend for the Flutter application. This ensures consistent data and business logic across web and mobile platforms.
*   **Separate Frontend:** Flutter will have its own UI implementation in Dart, leveraging Flutter's widget-based framework for a native look and feel.
*   **API Communication:** Flutter will communicate with the SvelteKit backend via HTTP requests to the same API endpoints used by the web app.
*   **Potential for Shared Logic:** While the UI is separate, some utility functions or data models could potentially be shared if a common language (like Dart for backend, or a transpiled language) were used, but for this plan, the focus is on shared API.

### 6. Enhanced Features for Vibe Coding Prompts

This feature focuses on generating creative content with a specific tone or style within the app, particularly for case descriptions or reports.

*   **Vibe Selection Interface:**
    *   A dropdown or set of buttons allowing users to select a "vibe" (e.g., "Formal," "Concise," "Dramatic," "Investigative," "Poetic").
    *   This selection will be passed as a parameter to the LLM prompt.
*   **LLM Integration for Content Generation:**
    *   The interactive canvas or case creation form will have a button or trigger to "Generate with Vibe."
    *   This will send the current input (e.g., raw notes, keywords) along with the selected "vibe" to a backend LLM endpoint (e.g., `api/nlp/analyze/+server.ts` or a new `api/nlp/generate-vibe/+server.ts`).
    *   The LLM will process the input and generate a case description or report text in the specified tone.
*   **Live2D/OBJ 3D Model for LLM Responses:**
    *   A dedicated Svelte page (e.g., `src/routes/llm-interactive/+page.svelte`) will host a Three.js canvas.
    *   This canvas will load a Live2D or OBJ 3D model.
    *   When an LLM response is received, the 3D model will animate (e.g., lip-sync, gestures) and the text will be displayed with a typewriter effect, creating an immersive "vibe coding" experience.
    *   The LLM response text will be streamed or delivered in chunks to facilitate the typewriter effect.
*   **Interactive Canvas for Report Creation:**
    *   The existing `interactive-canvas/+page.svelte` will be enhanced.
    *   Users can input descriptions or drag/drop elements.
    *   This input, combined with the selected "vibe," will be sent to the LLM.
    *   The LLM's output will then auto-populate a report template, which can be saved to the database. The `.md` files mentioned in the prompt suggest that these reports might be markdown-based, which aligns well with LLM text generation.

### 7. Homepage and User Homepage Enhancements

*   **Homepage (`+page.svelte`):**
    *   Implement a typewriter effect for a welcoming message like "What do you want to do today?".
    *   Below the message, a prominent prompt input field will allow users to directly enter a query that can initiate case creation or search.
*   **User Homepage (Dashboard/Profile):**
    *   Similar typewriter effect for a personalized greeting.
    *   A prompt field that directly leads to case CRUD operations or the interactive canvas for report generation.

### Architecture Diagram (High-Level)

```mermaid
graph TD
    A[User] -->|Accesses| B(SvelteKit Web App)
    B -->|SSR/Client-side| C(Svelte Components)
    C -->|API Calls| D(SvelteKit API Endpoints)
    D -->|DB Operations| E(Drizzle ORM)
    E -->|Data Storage| F(PostgreSQL/SQLite)

    D -->|Vector Search| G(Qdrant)
    G -->|Embeddings| H(LLM for Embeddings)

    B -->|Tauri WebView| I(Tauri Desktop App)
    I -->|IPC| J(Rust Backend)
    J -->|Native Ops| K(OS/Local Resources)

    B -->|Shared API| L(Flutter Mobile App)
    L -->|HTTP Requests| D

    C -->|Three.js/WebGL| M(3D Model Viewer)
    M -->|LLM Responses| N(Local LLM)
    C -->|Interactive Canvas| O(Report Generation)
    O -->|Vibe Prompts| N