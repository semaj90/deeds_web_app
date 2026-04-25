
# Project Plan: Multi-Platform Legal NLP Application (Revised)

## I. Overall Architecture (Refined)

The application will consist of three client applications (SvelteKit web, Rust Tauri desktop, Flutter mobile) interacting with a unified backend. The backend will be split into a Node.js Express API Gateway and a Python NLP/LLM Service, leveraging a vector database for semantic search and RAG.

```mermaid
graph TD
    A[SvelteKit Web App] --> B(Node.js Express API Gateway)
    C[Rust Tauri App] --> B
    D[Flutter App] --> B

    B -- API Calls --> E[Python NLP/LLM Service]
    E -- Vector Operations --> F[Vector Database (Qdrant)]
    E -- Data for RAG --> G[Main Database (PostgreSQL/SQLite)]

    F -- Embeddings --> E
    G -- Structured Data --> E

    subgraph Backend Deployment
        B -- Hosted on --> H[Vercel (Serverless Functions)]
        E -- Hosted on --> I[Dedicated VM / Cloud ML Platform]
        F -- Hosted on --> I
        G -- Hosted on --> I
    end

    subgraph Client-Side Caching
        A -- LocalStorage/IndexedDB --> J[recentCasesCache.ts]
        C -- Local Storage / SQLite --> K[Tauri Local Cache]
        D -- Shared Preferences / SQLite --> L[Flutter Local Cache]
    end

    subgraph Server-Side Caching
        B -- LokiJS / Node-Cache --> M[WardenNetCache]
    end

    subgraph User Feedback Loop
        A -- "Yes/No" Feedback --> N[API Gateway]
        N -- Store Feedback --> G
        G -- Influence RAG/Ranking --> E
    end
```

## II. Backend Infrastructure Setup

1.  **Node.js Express API Gateway (SvelteKit Backend on Vercel):**
    *   **Purpose:** Central API endpoint, handles authentication, basic CRUD, and proxies LLM-related requests to the Python NLP/LLM service. This will be deployed as serverless functions on Vercel.
    *   **Key Tasks:**
        *   Ensure existing SvelteKit API routes (`src/routes/api/...`) are configured to interact with the main database (PostgreSQL for Vercel deployment) and proxy to the Python NLP/LLM service.
        *   Implement robust error handling and logging.
        *   Configure `vercel.json` for serverless deployment.
        *   Update [`src/routes/api/cases/suggest-title/+server.ts`](web-app/sveltekit-frontend/src/routes/api/cases/suggest-title/+server.ts) to use `LLM_SERVICE_URL` from environment variables.
        *   Implement API endpoints for:
            *   `/api/cases/[caseId]/related`: For fetching related cases, leveraging Qdrant and user feedback.
            *   `/api/cases/[caseId]/feedback`: To receive and store user "yes/no" feedback on case relationships.
            *   `/api/nlp/summarize`: To request LLM summaries with RAG context.
            *   `/api/nlp/extract-entities`: For entity extraction.
            *   `/api/nlp/suggest-autocomplete`: For LLM-powered auto-completion.

2.  **Python NLP/LLM Service (Dedicated VM/ML Platform):**
    *   **Purpose:** Hosts the large language model (LLM) for generative tasks and the sentence-transformer BERT model for embedding generation. Handles heavy computational load.
    *   **Key Tasks:**
        *   Initialize a Python project (e.g., FastAPI).
        *   **LLM Loading & Quantization:**
            *   Use `llama-cpp-python` to load and perform inference on a 4GB quantized GGUF model.
            *   Ensure the chosen model is quantized (e.g., 4-bit or 8-bit) for optimal performance.
        *   **Sentence-Transformer BERT:**
            *   Load a pre-trained sentence-transformer BERT model (e.g., `all-MiniLM-L6-v2`) for embedding generation.
        *   **API Endpoints:**
            *   `/embed`: Accepts text, returns its vector embedding.
            *   `/generate`: Accepts prompt and context, returns LLM generated text (for summarization, title suggestion, etc.).
            *   `/health`: Basic health check.
            *   `/search-qdrant`: Performs Qdrant search based on query embedding and returns results.
            *   `/extract-entities`: Extracts entities from text.
            *   `/suggest-autocomplete`: Provides LLM-driven auto-completion.
        *   **Deployment:** Plan for deployment on a dedicated VM (e.g., AWS EC2, Google Cloud Compute Engine) or a specialized ML hosting platform due to model size and resource requirements.

3.  **Data Storage & Caching:**
    *   **Primary Data Store (Main Database):**
        *   **Local Development/Tauri:** Continue using SQLite (with Drizzle schema).
        *   **Production (Vercel/VM):** Migrate to PostgreSQL (e.g., via Supabase, Neon, or a self-hosted PostgreSQL instance on the VM) for scalability and concurrency. Adapt Drizzle schema for PostgreSQL.
        *   **New Table:** Create a `caseRelationshipFeedback` table (or extend `case_relationships` with a JSON array) to store user "yes/no" feedback on suggested relationships, including a score/counter.
    *   **Vector Database (Qdrant):**
        *   **Purpose:** Store vector embeddings of legal documents/case texts for efficient semantic search and RAG.
        *   **Setup:** Deploy Qdrant as a standalone service (can be on the same VM as the Python NLP/LLM service or a managed service).
        *   **Integration:** The Python NLP/LLM service will handle:
            *   Generating embeddings for new/updated case texts.
            *   Storing embeddings in Qdrant with `case_id` and `paragraph_id` metadata.
            *   Performing vector similarity searches.
    *   **Server-Side Caching (WardenNetCache):**
        *   **Implementation:** Use `WardenNetCache` (LokiJS or `node-cache`) within the Node.js Express API Gateway to cache frequently accessed API responses (e.g., recent cases, common search results).
        *   Cache LLM responses for identical prompts to reduce inference time and cost.
    *   **Client-Side Caching (recentCasesCache.ts):**
        *   **Implementation:** Leverage [`recentCasesCache.ts`](web-app/sveltekit-frontend/src/lib/stores/recentCasesCache.ts) (Svelte store + localStorage/IndexedDB) in the SvelteKit frontend for quick access to recently viewed cases and basic client-side auto-completion. This improves UI responsiveness.

## III. Core NLP & LLM Feature Implementation

1.  **Semantic Search with Refinement:**
    *   **Initial Retrieval (Qdrant):**
        *   User query from SvelteKit frontend -> Node.js API Gateway.
        *   API Gateway proxies query to Python NLP service's `/embed` endpoint.
        *   Python service generates embedding, performs cosine similarity search in Qdrant, retrieves top-N relevant case IDs/document chunks.
        *   Python service returns results to API Gateway, which sends them to the client.
    *   **Refinement with User Feedback ("Bicubic Search Gradient Descent" interpretation):**
        *   After initial Qdrant results, the client displays them.
        *   User provides "yes/no" feedback on related cases. This feedback is sent to the Node.js API Gateway and stored in the `caseRelationshipFeedback` table in PostgreSQL.
        *   **Re-ranking Logic:** The Python NLP service (or a dedicated ranking module within the API Gateway) will implement a re-ranking mechanism. This mechanism will:
            *   Take the initial Qdrant results.
            *   Query the `caseRelationshipFeedback` table to get historical user feedback for these cases.
            *   Boost or demote cases based on positive/negative feedback. This can be a simple weighted score or a more complex learning-to-rank model if data allows.
            *   Return the re-ranked results to the client.

2.  **Recommender Feature ("Are these related?"):**
    *   **Mechanism:**
        *   SvelteKit frontend sends two case IDs/descriptions to Node.js API Gateway.
        *   API Gateway sends texts to Python NLP service's `/embed` endpoint.
        *   Python service returns embeddings. API Gateway calculates cosine similarity.
        *   API Gateway queries `caseRelationshipFeedback` table for existing feedback on this pair.
        *   Returns similarity score and existing feedback to client.
        *   Client displays "yes/no" prompt. User feedback is captured and sent back to API Gateway to update `caseRelationshipFeedback` table.

3.  **Retrieval Augmented Generation (RAG):**
    *   **Mechanism:**
        *   User asks a question (e.g., "Summarize case X," "Suggest title for Y").
        *   SvelteKit frontend sends query to Node.js API Gateway.
        *   API Gateway fetches relevant information from PostgreSQL (e.g., case description, saved statements, related cases based on `caseRelationshipFeedback` and Qdrant scores).
        *   API Gateway constructs an augmented prompt including the user's question and the retrieved context.
        *   API Gateway sends the augmented prompt to the Python NLP service's `/generate` endpoint.
        *   Python service uses the 4GB LLM to generate a response.
        *   Response is returned to API Gateway, then to the client.
    *   **"Remembering" Relationships:** The `caseRelationshipFeedback` table (or JSON array in `case_relationships`) will be the source of truth for user-confirmed relationships, directly influencing the context retrieved for RAG.

## IV. Client Application Development

1.  **SvelteKit Web App:**
    *   **Frontend:** Implement UI components for:
        *   Semantic search input and results display.
        *   "Are these related?" prompt and feedback mechanism.
        *   Displaying LLM-generated summaries and title suggestions.
        *   Integration with [`recentCasesCache.ts`](web-app/sveltekit-frontend/src/lib/stores/recentCasesCache.ts) for client-side caching.
        *   UI for merge cases, auto-complete, drag & drop, move text, making API calls to the Node.js Express backend.
    *   **Deployment:** Deploy to Vercel. Ensure environment variables (`LLM_SERVICE_URL`, database connection strings) are correctly set in Vercel project settings.

2.  **Rust Tauri App:**
    *   **Desktop Framework:** Tauri embeds the SvelteKit web app.
    *   **API Integration:** The Tauri app will make API calls to the Node.js Express backend, just like the web app.
    *   **Local Data/Features:**
        *   Can use local SQLite for offline data storage (separate from the main production database).
        *   Leverage Tauri's Rust backend for native features (file system access, notifications).
        *   **Local LLM (Optional, Small Scale):** If *offline* inference of a *very small* model (<100MB) is required for specific, lightweight tasks, Rust bindings to `llama.cpp` could be integrated directly into the Tauri app. This would be a separate, limited LLM capability, not the main 4GB model.

3.  **Flutter App:**
    *   **Mobile Framework:** Flutter for cross-platform mobile (iOS, Android).
    *   **API Integration:** Use `http` or `dio` packages to make API calls to the Node.js Express backend.
    *   **UI/UX:** Design a mobile-first UI for all features.
    *   **Local Data/Features:**
        *   Can use `sqflite` for local SQLite database for offline data.
        *   **Local LLM (Optional, Small Scale):** Similar to Tauri, direct integration of `llama.cpp` for *very small* models might be possible via Flutter plugins (e.g., `flutter_llama_cpp`), but prioritize API calls for the main LLM.

## V. Deployment Considerations

*   **Vercel for SvelteKit/Node.js API Gateway:**
    *   Handles frontend hosting and serverless functions for the Node.js API.
    *   Requires managed PostgreSQL (Supabase, Neon, etc.) for the main database.
    *   Cannot host the 4GB LLM directly.
*   **Dedicated VM/Cloud ML Platform for Python NLP/LLM Service & Qdrant:**
    *   Essential for hosting the large LLM and Qdrant.
    *   Consider cloud providers like AWS (EC2, SageMaker), Google Cloud (Compute Engine, Vertex AI), Azure (VMs, Azure Machine Learning).
    *   Cost will be based on VM instance type (GPU recommended for LLM inference), storage, and data transfer.
*   **Firebase/Vercel for Database:** Firebase (Firestore or Cloud SQL) can be used for the main database if a NoSQL approach is desired or if you want a managed PostgreSQL instance. For Drizzle ORM, a PostgreSQL-compatible service is ideal.

## VI. Development Workflow

1.  **Backend First:**
    *   Set up Node.js Express API Gateway and basic Python NLP/LLM service (with placeholder responses) to establish communication.
    *   Configure PostgreSQL for production and adapt Drizzle schema.
    *   Implement `caseRelationshipFeedback` table.
2.  **Data Ingestion:**
    *   Develop scripts/processes to ingest existing legal documents, generate embeddings using the Python service, and populate Qdrant.
3.  **Core NLP Features:**
    *   Implement semantic search, RAG, and recommendation logic in the Python service.
    *   Develop the re-ranking logic based on user feedback.
    *   Expose these features via the Node.js API Gateway.
4.  **Client Integration:**
    *   Integrate API calls into SvelteKit, Tauri, and Flutter applications.
    *   Develop UI/UX for all new features.
5.  **Deployment & Testing:**
    *   Deploy SvelteKit frontend and Node.js API Gateway to Vercel.
    *   Deploy Python NLP/LLM service and Qdrant to the chosen VM/ML platform.
    *   Thoroughly test all components, focusing on LLM inference, semantic search accuracy, RAG performance, and user feedback loop. Monitor latency and costs.