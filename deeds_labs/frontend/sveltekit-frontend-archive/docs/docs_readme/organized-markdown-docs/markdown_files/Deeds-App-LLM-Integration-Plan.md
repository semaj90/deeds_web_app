# Project Plan: Multi-Platform Legal NLP Application

## I. Overall Architecture

The application will consist of three client applications (SvelteKit web, Rust Tauri desktop, Flutter mobile) interacting with a unified backend. The backend will be split into a Node.js Express API Gateway and a Python NLP/LLM Service, leveraging a vector database for semantic search and RAG.

```mermaid
graph TD
    A[SvelteKit Web App] --> B(Node.js Express API Gateway)
    C[Rust Tauri App] --> B
    D[Flutter App] --> B

    B --> E[Python NLP/LLM Service]
    E --> F[Vector Database (Qdrant)]
    E --> G[Main Database (SQLite/PostgreSQL)]

    F -- Embeddings --> E
    G -- Data for RAG --> E

    subgraph Backend Deployment
        B -- Hosted on --> H[Vercel (Serverless Functions)]
        E -- Hosted on --> I[Dedicated VM / Cloud ML Platform]
        F -- Hosted on --> I
        G -- Hosted on --> I
    end
```

## II. Detailed Plan

### Goal 1: Set up the Backend Infrastructure

1.  **Node.js Express API Gateway:**
    *   **Purpose:** Act as the central API endpoint for all client applications, proxying requests to the Python NLP/LLM service and handling general application logic (user authentication, CRUD operations for cases, etc.).
    *   **Setup:**
        *   Initialize a new Node.js project with Express.
        *   Define API routes for all client-facing operations (e.g., `/api/cases`, `/api/criminals`, `/api/nlp/analyze`, `/api/nlp/recommendations`).
        *   Implement middleware for authentication and error handling.
        *   Use a library like `node-fetch` or `axios` to make internal HTTP requests to the Python NLP/LLM service.
        *   **Deployment on Vercel:** Configure `vercel.json` to deploy the Node.js Express application as serverless functions. This will serve as the `HOSTED_LLM_API_URL` from the client's perspective, even though it proxies to the Python service.

2.  **Python NLP/LLM Service:**
    *   **Purpose:** Host the large language model (LLM) for generative tasks and the sentence-transformer BERT model for embedding generation. This service will handle the heavy computational load of NLP.
    *   **Setup:**
        *   Initialize a Python project (e.g., using Flask or FastAPI).
        *   **LLM Loading & Quantization:**
            *   For a 4GB generative LLM (e.g., a Llama model), use `llama.cpp` (or its Python bindings like `llama-cpp-python`) to load and perform inference on quantized GGUF models.
            *   Implement a script to quantize the chosen 4GB model to a smaller size (e.g., 4-bit or 8-bit) if not already quantized.
            *   Load the quantized model into memory upon service startup.
        *   **Sentence-Transformer BERT:**
            *   Use the Hugging Face `transformers` library to load a pre-trained sentence-transformer BERT model (e.g., `all-MiniLM-L6-v2` for general embeddings, or a specialized legal BERT model if available).
            *   Implement an endpoint for generating embeddings from input text.
        *   **API Endpoints:**
            *   `/embed`: Accepts text, returns its vector embedding.
            *   `/generate`: Accepts prompt and context, returns LLM generated text.
            *   `/health`: Basic health check.
        *   **Deployment:** Due to the 4GB model size, this service will likely require a dedicated Virtual Machine (VM) on a cloud provider (AWS EC2, Google Cloud Compute Engine, Azure VM) or a specialized ML hosting platform (e.g., Hugging Face Inference Endpoints, Replicate, RunPod) rather than Vercel's serverless functions.

3.  **Data Storage & Caching:**
    *   **Main Database:**
        *   **Recommendation:** Continue using SQLite3 for local development and testing, as indicated by `drizzle.config.json` and `dev.db`.
        *   For production, consider migrating to a more robust relational database like PostgreSQL (with Drizzle ORM) for scalability, concurrency, and data integrity, especially for legal data.
        *   **Data:** Store case details, criminal records, statutes, user data, and raw legal documents.
    *   **Vector Database (Qdrant):**
        *   **Purpose:** Store vector embeddings of legal documents/case texts for efficient semantic search and RAG.
        *   **Setup:** Deploy Qdrant as a standalone service (can be on the same VM as the Python NLP/LLM service or a managed service).
        *   **Integration:** The Python NLP/LLM service will be responsible for:
            *   Generating embeddings for new or updated legal documents/case texts using the BERT model.
            *   Storing these embeddings in Qdrant, along with metadata (e.g., `case_id`, `paragraph_id`).
            *   Performing vector similarity searches based on user queries.
    *   **Caching:**
        *   **Recommendation:** Implement caching at the Node.js Express API Gateway level for frequently accessed data (e.g., user profiles, common search results) using an in-memory cache (like `node-cache`) for single instances or Redis for distributed caching in a scaled environment.
        *   Cache LLM responses for identical prompts to reduce inference time and cost.

### III. Implement Core NLP & LLM Features

1.  **Semantic Search:**
    *   **Mechanism:**
        *   User query is sent to the Node.js API Gateway.
        *   API Gateway forwards the query to the Python NLP/LLM service's `/embed` endpoint to get its vector embedding.
        *   The Python service performs a similarity search in Qdrant using the query embedding to retrieve relevant legal document chunks/case IDs.
        *   The retrieved chunks/metadata are returned to the Node.js API Gateway, which then sends them to the client.
    *   **"Bicubic Search Gradient Descent":** Interpret this as an advanced ranking/re-ranking mechanism for search results. This could involve:
        *   Initial semantic similarity search.
        *   Applying a gradient descent-like optimization to re-rank results based on additional features (e.g., recency, relevance scores, user interaction history, explicit "yes/no" feedback). This would require a custom ranking model.

2.  **Recommender Feature ("Are these related?"):**
    *   **Mechanism:**
        *   When a user asks "Are these related?" for two cases/documents, the Node.js API sends their text content to the Python NLP/LLM service for embedding.
        *   The Python service calculates the cosine similarity between the two embeddings.
        *   A similarity score is returned to the client, along with a "yes/no" prompt for user feedback.
    *   **User Feedback & RAG Updates:**
        *   Store user "yes/no" feedback (e.g., in the main database, linked to case IDs and user IDs).
        *   **Counter for RAG:** Maintain a counter for positive/negative feedback on specific recommendations or document pairs.
        *   **RAG Update Mechanism:** Periodically (or based on a threshold of feedback), use this feedback to:
            *   **Refine Embeddings:** Potentially fine-tune the sentence-transformer model on a small dataset of user-labeled "related/not related" pairs (requires significant ML expertise and data).
            *   **Update Ranking Model:** Adjust parameters in the "bicubic search" ranking model to prioritize documents that users have marked as related.
            *   **Knowledge Graph/State Machine:** Use a state machine (as you mentioned) to track relationships between cases/documents based on user feedback. This could inform future RAG retrievals.

3.  **Retrieval Augmented Generation (RAG):**
    *   **Mechanism:**
        *   User asks a question (e.g., "Summarize case X" or "What are the legal precedents for Y?").
        *   Node.js API sends the query to the Python NLP/LLM service.
        *   Python service:
            *   Embeds the user query.
            *   Performs semantic search in Qdrant to retrieve the most relevant legal document chunks.
            *   Constructs a prompt for the generative LLM, including the user's question and the retrieved context.
            *   Sends the augmented prompt to the 4GB generative LLM.
            *   Returns the LLM's response to the Node.js API, which then sends it to the client.

### IV. Develop Client Applications

1.  **SvelteKit Web App:**
    *   **Frontend Framework:** SvelteKit for reactive UI and server-side rendering (SSR).
    *   **API Integration:** Use SvelteKit's `+page.server.ts` or `+server.ts` files to make API calls to the Node.js Express backend.
    *   **UI Components:** Develop components for displaying search results, case details, recommendation prompts, and LLM responses.
    *   **WebAssembly/llama.cpp:** Not directly used for the 4GB model. If a *very small* auxiliary model (e.g., <100MB) is needed for offline, client-side tasks, then WebAssembly with `llama.cpp` bindings (e.g., `llama-cpp-js`) could be explored, but this adds significant complexity. Stick to API calls for the main LLM.

2.  **Rust Tauri App:**
    *   **Desktop Framework:** Tauri for building cross-platform desktop applications using web technologies (SvelteKit frontend).
    *   **API Integration:** The Tauri app will embed the SvelteKit web app and make API calls to the Node.js Express backend.
    *   **Native Features:** Leverage Tauri's Rust backend for native functionalities like file system access, notifications, or potentially local data storage if needed (though centralizing data on the server is preferred).
    *   **Local LLM Inference (Optional & Small Scale):** If there's a strong requirement for *offline* inference of a *very small* model (e.g., for basic text processing), Rust bindings to `llama.cpp` could be integrated directly into the Tauri app. This would be separate from the main 4GB LLM.

3.  **Flutter App:**
    *   **Mobile Framework:** Flutter for building cross-platform mobile applications (iOS, Android).
    *   **API Integration:** Use `http` package or `dio` for making API calls to the Node.js Express backend.
    *   **UI/UX:** Design a responsive and intuitive mobile interface for interacting with the NLP features.
    *   **Local LLM Inference (Optional & Small Scale):** Similar to Tauri, direct integration of `llama.cpp` for *very small* models might be possible via Flutter plugins (e.g., `flutter_llama_cpp`), but again, prioritize API calls for the main LLM.

### V. Development Workflow

1.  **Backend First:** Start by setting up the Node.js Express API Gateway and a basic Python NLP/LLM service (even with a placeholder LLM) to establish communication.
2.  **Data Ingestion:** Implement the process for ingesting legal documents, generating embeddings, and populating the Qdrant vector database.
3.  **Core NLP Features:** Develop the semantic search, RAG, and recommendation logic within the Python service and expose them via the Node.js API.
4.  **Client Integration:** Integrate the API calls into the SvelteKit, Tauri, and Flutter applications.
5.  **Deployment:**
    *   Deploy the SvelteKit frontend and Node.js Express API Gateway to Vercel.
    *   Deploy the Python NLP/LLM service and Qdrant to a dedicated VM or cloud ML platform.
6.  **Testing:** Thoroughly test all components, especially the LLM inference, semantic search accuracy, and RAG performance.

### VI. Considerations & Best Practices

*   **Model Quantization:** Ensure the 4GB model is properly quantized (e.g., to GGUF format for `llama.cpp`) to optimize memory usage and inference speed.
*   **Scalability:** Design the Node.js and Python services for scalability. Use asynchronous operations and consider containerization (Docker) for easier deployment and scaling.
*   **Security:** Implement robust authentication and authorization for all API endpoints. Secure API keys and sensitive data.
*   **Error Handling & Logging:** Implement comprehensive error handling and logging across all services for debugging and monitoring.
*   **Performance Monitoring:** Monitor the performance of the LLM service (latency, throughput, memory usage) to identify bottlenecks.
*   **Cost Optimization:** Be mindful of cloud costs for VM instances and managed database services.
*   **Legal Data Specifics:** For legal NLP, consider using domain-specific pre-trained models or fine-tuning general models on legal datasets for better accuracy.