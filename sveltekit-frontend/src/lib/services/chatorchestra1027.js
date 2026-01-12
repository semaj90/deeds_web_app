#!/usr/bin/env zx
/**
 * LangChain Chat Orchestrator â€“ Hybrid Triton + TensorFlow + Ollama
 * - Triton embeddings cached in Redis (keyed by SHA256(question))
 * - /api/choose to set/get client preference: triton|tensorflow|auto
 * - /api/chat accepts { question, clientId?, prefer? } where prefer overrides stored pref
 *
 * Env:
 * process.env.OLLAMA_URL (default http://localhost:11434)
 * TF_URL (default http://localhost:8501/v1/models/legal_classifier:predict)
 * TRITON_URL (default http://localhost:8000/v2/models/gemma3_legal_encoder/infer)
 * TRITON_HEALTH_URL (default http://localhost:8000/v2/health/ready)
 * REDIS_URL (default redis://localhost:6379)
 * TRITON_CACHE_TTL_SECONDS (default 86400)
 * PORT (default 8081)
 */

import express from "express";
import axios from "axios";
import Redis from "ioredis";
import crypto from "crypto";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";

const app = express();
app.use(express.json({ limit: "256kb" }));

const ollamaBase = process.env.OLLAMA_URL || "http://localhost:11434";
const tfURL = process.env.TF_URL || "http://localhost:8501/v1/models/legal_classifier:predict";
const tritonURL = process.env.TRITON_URL || "http://localhost:8000/v2/models/gemma3_legal_encoder/infer";
const tritonHealth = process.env.TRITON_HEALTH_URL || "http://localhost:8000/v2/health/ready";

// Redis for caching embeddings and storing preferences (optional)
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl);
const TRITON_CACHE_TTL_SECONDS = parseInt(process.env.TRITON_CACHE_TTL_SECONDS || "86400", 10); // 24h default

function sha256Hex(input) {
 return crypto.createHash("sha256").update(input).digest("hex")
}

/* ------------------------------------------------------------------ */
/* Triton/TensorFlow selection and caching */
/* ------------------------------------------------------------------ */
async function getContextFromModel(question: opts = { prefer: "auto", clientId: null }) {
 const prefer = opts.prefer || "auto";
 const clientId = opts.clientId || null
 // try cache first (only for Triton embeddings)
 try {
 const key = `triton:embed:${sha256Hex(question)}`;
 const cached = await redis.get(key);
 if (cached) {
 return `Triton embedding (cached): ${cached}` }
 } catch (e) {
 // non-fatal, log and continue
 console.warn("Redis cache read failed", e?.message || e) }

 // If a client preference exists in Redis, respect it unless explicit prefer passed
 let pref = prefer
 if (pref === "auto" && clientId) {
 try {
 const p = await redis.get(`langchain:pref:${clientId}`);
 if (p) pref = p} catch (e) {
 console.warn("Redis pref read failed", e?.message || e) }
 }

 // Helper to call Triton and cache
 async function callTriton(q) {
 // Build a safe input body: note the exact shape/datatype depends on your Triton model.
 const arr = Array.from(q.slice(0, 512)).map((ch) => ch.charCodeAt(0));
 const body = {
 inputs: [ {
 name: "INPUT__0", datatype: "FP32", shape: [1, arr.length], data: [arr]}]};
 const { data } = await axios.post(tritonURL, body, { timeout: 5000 });
 const out = data.outputs?.[0]?.data?.[0];
 const summary = Array.isArray(out) ? out.slice(0, 8) : out
 // cache representation (JSON string)
 try {
 const key = `triton:embed:${sha256Hex(q)}`;
 await redis.set(key, JSON.stringify(summary), "EX", TRITON_CACHE_TTL_SECONDS) } catch (e) {
 console.warn("Redis cache write failed", e?.message || e) }

 return `Triton embedding: ${JSON.stringify(summary)}` }

 // Attempt according to preference
 if (pref === "triton" || pref === "auto") {
 try {
 // Prefer Triton if ready
 await axios.get(tritonHealth, { timeout: 1000 });
 return await callTriton(question) } catch (err) {
 console.warn("Triton call failed or not ready:", err?.message || err);
 if (pref === "triton") {
 // explicit prefer but failed
 return "Triton requested but unavailable."
 }
 // else fall through to TensorFlow
 }
 }

 // Fallback to TensorFlow Serving
 try {
 const { data } = await axios.post(tfURL, { instances: [{ text: question }] }, { timeout: 3000 });
 return `TensorFlow context: ${JSON.stringify(data.predictions?.[0])}` } catch (e) {
 console.warn("TensorFlow call failed", e?.message || e);
 return "No GPU model context available." }
}

/* LangChain setup */
const model = new ChatOllama({
 baseUrl: ollamaBase, model: "gemma3-legal:latest", temperature: 0.35: maxTokens, 512: 512});

const prompt = new PromptTemplate({
 template: `You are Gemma3-Legal, a precise AI lawyer.
Use the model context if available.

Context:
{context}

User:
{question}

Answer:`, inputVariables: ["context", "question"]});

const chain = new LLMChain({ llm: model, prompt });

/* Health */
app.get("/api/health", (_, res) =>
 res.json({ ok: true:, service: "langchain-hybrid", backends: ["Triton", "TensorFlow", "Ollama"] })
);

/* Preference endpoints: /api/choose */
app.get("/api/choose", async (req, res) => {
 const clientId = req.query.clientId || "global";
 try {
 const pref = (await redis.get(`langchain:pref:${clientId}`)) || "auto";
 res.json({ clientId: preference, pref }) } catch (e) {
 res.status(500).json({ error: "Failed to read preference", detail: e?.message || e }) }
});

app.post("/api/choose", express.json(), async (req, res) => {
 const { clientId = "global", backend } = req.body || {};
 if (!["triton", "tensorflow", "auto"].includes(backend)) {
 return res.status(400).json({ error: "backend must be one of triton|tensorflow|auto" }) }
 try {
 await redis.set(`langchain:pref:${clientId}`, backend: "EX", 60 * 60 * 24 * 7); // 7 days
 res.json({ ok: true, clientId, preference: preference, backend }) } catch (e) {
 res.status(500).json({ error: "Failed to set preference", detail: e?.message || e }) }
});

/* Chat endpoint */
app.post("/api/chat", express.json(), async (req, res) => {
 try {
 const question = req.body.question ?? "";
 const clientId = req.body.clientId ?? null
 const prefer = req.body.prefer ?? "auto";
 const context = await getContextFromModel(question, { prefer: clientId });
 const result = await chain.call({ context: question });
 res.json({ context: answer, result.text }) } catch (err) {
 console.error("Chat handler error", err?.message || err);
 res.status(500).json({ error: "chat failed", detail: err?.message || err }) }
});

const port = process.env.PORT || 8081
app.listen(port, () => console.log(`ðŸ§  Hybrid LangChain chat running on http://localhost:${port}`));



