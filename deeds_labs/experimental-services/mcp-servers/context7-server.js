const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Mock documentation data for testing
const mockDocs = {
  typescript: {
    base: {
      content: `# TypeScript Documentation

TypeScript is a strongly typed programming language that builds on JavaScript.

## Key Features
- Static type checking
- Modern JavaScript features
- Rich IDE support
- Gradual adoption

## Getting Started
\`\`\`bash
npm install -g typescript
tsc --init
\`\`\`

TypeScript helps catch errors early and improves code maintainability.`,
      metadata: { version: "5.0", category: "language" },
    },
    interfaces: {
      content: `# TypeScript Interfaces

Interfaces define contracts in your code and provide explicit names for type checking.

## Basic Interface
\`\`\`typescript
interface User {
  name: string;
  age: number;
  email?: string;
}
\`\`\`

## Extending Interfaces
\`\`\`typescript
interface Admin extends User {
  permissions: string[];
  isActive: boolean;
}
\`\`\`

## Method Signatures
\`\`\`typescript
interface Calculator {
  add(a: number, b: number): number;
  multiply(a: number, b: number): number;
}
\`\`\`

Interfaces are a powerful way to define contracts within your code.`,
      metadata: { version: "5.0", category: "types" },
    },
  },
  webgpu: {
    base: {
      content: `# WebGPU Documentation

WebGPU is a new web standard for GPU computing and rendering.

## Overview
WebGPU provides low-level, high-performance access to graphics and compute capabilities.

## Key Components
- GPU Device
- Command Encoders
- Render Pipelines
- Compute Pipelines
- Buffers and Textures

## Getting Started
\`\`\`javascript
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
\`\`\`

WebGPU enables high-performance graphics and compute on the web.`,
      metadata: { version: "1.0", category: "graphics" },
    },
    shaders: {
      content: `# WebGPU Shaders with WGSL

WGSL (WebGPU Shading Language) is used to write shaders for WebGPU.

## Vertex Shader
\`\`\`wgsl
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>( 0.0,  0.5),
        vec2<f32>(-0.5, -0.5),
        vec2<f32>( 0.5, -0.5)
    );
    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}
\`\`\`

## Fragment Shader
\`\`\`wgsl
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
\`\`\`

## Compute Shader
\`\`\`wgsl
@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Compute operations
}
\`\`\`

WGSL provides modern GPU programming capabilities.`,
      metadata: { version: "1.0", category: "shaders" },
    },
  },
  postgresql: {
    base: {
      content: `# PostgreSQL 17 Documentation

PostgreSQL is a powerful, open source object-relational database system.

## New in PostgreSQL 17
- Enhanced performance improvements
- Better JSON handling
- Advanced indexing options
- Improved security features

## Key Features
- ACID compliance
- Extensibility
- Standards compliance
- Reliability

## Getting Started
\`\`\`sql
CREATE DATABASE myapp;
\\c myapp
CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
\`\`\`

PostgreSQL provides enterprise-class database capabilities.`,
      metadata: { version: "17.0", category: "database" },
    },
    jsonb: {
      content: `# PostgreSQL JSONB

JSONB is a binary representation of JSON data that's optimized for performance.

## Creating JSONB Columns
\`\`\`sql
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

## Indexing JSONB
\`\`\`sql
CREATE INDEX idx_documents_data ON documents USING gin (data);
CREATE INDEX idx_documents_name ON documents USING btree ((data->>'name'));
\`\`\`

## Querying JSONB
\`\`\`sql
-- Contains operator
SELECT * FROM documents WHERE data @> '{"status": "active"}';

-- Path queries
SELECT data->'user'->>'name' FROM documents;

-- Array operations
SELECT * FROM documents WHERE data->'tags' ? 'important';
\`\`\`

JSONB provides efficient JSON storage and querying capabilities.`,
      metadata: { version: "17.0", category: "json" },
    },
  },
  "drizzle-orm": {
    base: {
      content: `# Drizzle ORM Documentation

Drizzle ORM is a TypeScript ORM with a focus on type safety and performance.

## Key Features
- Fully type-safe
- SQL-like syntax
- Zero runtime overhead
- Database agnostic

## Installation
\`\`\`bash
npm install drizzle-orm
npm install -D drizzle-kit
\`\`\`

## Quick Start
\`\`\`typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const sql = postgres('postgresql://...', { max: 10 });
const db = drizzle(sql);
\`\`\`

Drizzle provides type-safe database operations.`,
      metadata: { version: "0.29", category: "orm" },
    },
    schema: {
      content: `# Drizzle ORM Schema Definition

Define your database schema with full TypeScript support.

## Table Definition
\`\`\`typescript
import { pgTable, serial, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
\`\`\`

## Relations
\`\`\`typescript
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
});
\`\`\`

## Queries
\`\`\`typescript
// Select with relations
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
});

// Type-safe filtering
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.metadata->>'status', 'active'));
\`\`\`

Drizzle provides compile-time type safety with zero runtime overhead.`,
      metadata: { version: "0.29", category: "schema" },
    },
  },
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Context7 MCP Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// MCP tools endpoint
app.post('/tools/call', (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    if (name === "get_library_docs") {
      const {
        context7CompatibleLibraryID,
        topic,
        tokens = 10000,
        format = "markdown",
      } = args;

      // Normalize library ID
      const libraryId = context7CompatibleLibraryID
        .replace(/^\//, "")
        .replace(/\/$/, "");

      // Get documentation
      const library = mockDocs[libraryId];
      if (!library) {
        return res.status(404).json({
          success: false,
          error: `Library '${libraryId}' not found. Available: ${Object.keys(
            mockDocs
          ).join(", ")}`,
        });
      }

      // Get specific topic or base documentation
      const doc = topic && library[topic] ? library[topic] : library.base;
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `Topic '${topic}' not found for library '${libraryId}'. Available: ${Object.keys(
            library
          ).join(", ")}`,
        });
      }

      // Prepare response
      const result = {
        content: doc.content,
        metadata: {
          library: libraryId,
          topic: topic || "base",
          ...doc.metadata,
          tokenCount: doc.content.length,
          format: format,
        },
        snippets: extractCodeSnippets(doc.content),
      };

      res.json({
        success: true,
        result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Unknown tool: ${name}`,
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Extract code snippets from markdown content
function extractCodeSnippets(content) {
  const snippets = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || "text";
    const code = match[2].trim();

    if (code.length > 0) {
      snippets.push({
        title: `${
          language.charAt(0).toUpperCase() + language.slice(1)
        } Example`,
        code: code,
        description: `Example ${language} code snippet`,
      });
    }
  }

  return snippets;
}

// List available libraries
app.get("/libraries", (req, res) => {
  const libraries = Object.keys(mockDocs).map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1).replace("-", " "),
    topics: Object.keys(mockDocs[id]).filter((key) => key !== "base"),
  }));

  res.json({
    success: true,
    libraries,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Context7 MCP Server running on http://localhost:${PORT}`);
  console.log(`📚 Available libraries: ${Object.keys(mockDocs).join(', ')}`);
  console.log(`🔧 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;