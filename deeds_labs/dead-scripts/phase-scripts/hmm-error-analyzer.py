#!/usr/bin/env python3
"""
HMM-based Error Analysis with LangChain RAG + Ollama
Uses Hidden Markov Model to detect error patterns and sequences,
integrated with LangChain RAG for deep research using Ollama gemma3-legal:latest

Requirements:
pip install langchain langchain-ollama chromadb hmmlearn numpy pandas networkx
"""

import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import networkx as nx
import numpy as np

# Optional HMM imports
try:
    from hmmlearn import hmm
    HMM_AVAILABLE = True
except ImportError:
    HMM_AVAILABLE = False
    print("⚠️ hmmlearn not installed. Install with: pip install hmmlearn")

# Optional LangChain imports
try:
    from langchain_ollama import OllamaLLM, OllamaEmbeddings
    from langchain.prompts import PromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False
    print("⚠️ LangChain not installed. Install with: pip install langchain langchain-ollama")


class ErrorPatternGraph:
    """
    Builds a directed graph of error patterns and their relationships.
    Nodes represent error types, edges represent co-occurrence/causality.
    """

    def __init__(self):
        self.graph = nx.DiGraph()
        self.error_categories = {
            "import_type": r"cannot be used as a value because it was imported using 'import type'",
            "missing_comma": r"',' expected",
            "missing_semicolon": r"';' expected",
            "missing_colon": r"':' expected",
            "missing_brace": r"'\}' expected",
            "cannot_find_name": r"Cannot find name",
            "property_not_exist": r"Property .* does not exist on type",
            "type_mismatch": r"Type .* is not assignable to type",
            "module_no_export": r"Module .* has no exported member",
            "svelte_event": r"on:\w+",
            "object_literal": r"Object literal may only specify known properties",
            "schema_redeclare": r"Cannot redeclare block-scoped variable",
        }
        self.file_errors: dict[str, list[dict]] = defaultdict(list)

    def parse_svelte_check_output(self, log_path: str):
        """Parse svelte-check machine output format"""
        errors = []

        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                # Parse machine format: TIMESTAMP STATUS "file" line:col "message"
                match = re.match(r'(\d+)\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"', line.strip())
                if match:
                    _, filepath, line_no, col, message = match.groups()

                    # Categorize error
                    category = "other"
                    for cat_name, pattern in self.error_categories.items():
                        if re.search(pattern, message, re.IGNORECASE):
                            category = cat_name
                            break

                    error = {
                        "file": filepath,
                        "line": int(line_no),
                        "col": int(col),
                        "message": message,
                        "category": category,
                    }
                    errors.append(error)
                    self.file_errors[filepath].append(error)

        return errors

    def build_graph(self, errors: list[dict]):
        """Build a graph of error relationships"""
        # Count error categories
        category_counts = Counter(e["category"] for e in errors)

        # Add nodes with counts
        for category, count in category_counts.items():
            self.graph.add_node(category, count=count, type="category")

        # Build edges based on co-occurrence in files
        for file_path, file_errors in self.file_errors.items():
            categories_in_file = list(set(e["category"] for e in file_errors))

            # Create edges between categories that appear together
            for i, cat1 in enumerate(categories_in_file):
                for cat2 in categories_in_file[i+1:]:
                    if self.graph.has_edge(cat1, cat2):
                        self.graph[cat1][cat2]["weight"] += 1
                    else:
                        self.graph.add_edge(cat1, cat2, weight=1)

        return self.graph

    def get_priority_files(self, top_n: int = 20) -> list[tuple[str, int]]:
        """Get files with most errors"""
        file_counts = [(f, len(errs)) for f, errs in self.file_errors.items()]
        return sorted(file_counts, key=lambda x: x[1], reverse=True)[:top_n]

    def export_graph_json(self, output_path: str):
        """Export graph as JSON for visualization"""
        data = {
            "nodes": [
                {"id": n, **self.graph.nodes[n]}
                for n in self.graph.nodes
            ],
            "edges": [
                {"source": u, "target": v, **self.graph.edges[u, v]}
                for u, v in self.graph.edges
            ]
        }
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        return data


class HMMErrorModel:
    """
    Hidden Markov Model for error sequence analysis.
    - Hidden states: True error pattern (e.g., "corruption", "migration", "type_error")
    - Observable: Reported error categories
    """

    def __init__(self, n_hidden_states: int = 5):
        self.n_hidden_states = n_hidden_states
        self.model = None
        self.category_to_idx: dict[str, int] = {}
        self.idx_to_category: dict[int, str] = {}

    def prepare_sequences(self, file_errors: dict[str, list[dict]]) -> list[np.ndarray]:
        """Convert file error sequences to numerical arrays"""
        # Build category index
        all_categories = set()
        for errors in file_errors.values():
            for e in errors:
                all_categories.add(e["category"])

        self.category_to_idx = {cat: i for i, cat in enumerate(sorted(all_categories))}
        self.idx_to_category = {i: cat for cat, i in self.category_to_idx.items()}

        # Convert to sequences
        sequences = []
        for file_path, errors in file_errors.items():
            if len(errors) >= 2:  # Need at least 2 for sequence
                seq = np.array([[self.category_to_idx[e["category"]]] for e in errors])
                sequences.append(seq)

        return sequences

    def train(self, sequences: list[np.ndarray]):
        """Train HMM on error sequences"""
        if not HMM_AVAILABLE:
            print("❌ hmmlearn not available")
            return None

        if not sequences:
            print("❌ No sequences to train on")
            return None

        # Concatenate sequences for training
        X = np.vstack(sequences)
        lengths = [len(seq) for seq in sequences]

        # Train Gaussian HMM
        self.model = hmm.GaussianHMM(
            n_components=self.n_hidden_states,
            covariance_type="diag",
            n_iter=100,
            random_state=42
        )

        try:
            self.model.fit(X, lengths)
            print(f"✅ HMM trained with {self.n_hidden_states} hidden states")
            return self.model
        except Exception as e:
            print(f"❌ HMM training failed: {e}")
            return None

    def predict_hidden_states(self, sequence: np.ndarray) -> np.ndarray:
        """Predict hidden states for a sequence"""
        if self.model is None:
            return np.array([])

        return self.model.predict(sequence)

    def get_transition_matrix(self) -> np.ndarray:
        """Get the learned transition probabilities"""
        if self.model is None:
            return np.array([])

        return self.model.transmat_


class LangChainRAGAgent:
    """
    LangChain RAG Agent using Ollama gemma3-legal:latest
    for deep error analysis and fix suggestions.
    """

    def __init__(self, model_name: str = "gemma3-legal:latest"):
        self.model_name = model_name
        self.llm = None
        self.embeddings = None

        if LANGCHAIN_AVAILABLE:
            try:
                self.llm = OllamaLLM(
                    model=model_name,
                    base_url="http://localhost:11434",
                    temperature=0.1,
                )
                self.embeddings = OllamaEmbeddings(
                    model="nomic-embed-text",
                    base_url="http://localhost:11434",
                )
                print(f"✅ LangChain initialized with {model_name}")
            except Exception as e:
                print(f"⚠️ Could not initialize LangChain: {e}")

    def analyze_error_cluster(self, errors: list[dict], context: str = "") -> str:
        """Analyze a cluster of related errors"""
        if not self.llm:
            return "LangChain not available"

        # Build error summary
        error_summary = "\n".join([
            f"- {e['file']}:{e['line']} - {e['category']}: {e['message'][:100]}"
            for e in errors[:20]  # Limit to first 20
        ])

        prompt = PromptTemplate.from_template("""
You are an expert TypeScript/Svelte 5 developer debugging a large codebase.

## Error Cluster Analysis
The following errors appear to be related:

{error_summary}

## Additional Context
{context}

## Your Task
1. Identify the ROOT CAUSE of these errors (not just symptoms)
2. Determine if this is a corruption pattern (malformed syntax) or logical error
3. Suggest a SPECIFIC fix strategy
4. Provide code example if applicable

Be concise and actionable.
""")

        chain = prompt | self.llm | StrOutputParser()

        try:
            return chain.invoke({
                "error_summary": error_summary,
                "context": context
            })
        except Exception as e:
            return f"Analysis failed: {e}"

    def suggest_fix_for_pattern(self, pattern: str, examples: list[str]) -> str:
        """Suggest fixes for a specific error pattern"""
        if not self.llm:
            return "LangChain not available"

        prompt = PromptTemplate.from_template("""
You are fixing TypeScript/Svelte 5 code corruption.

## Pattern Detected: {pattern}

## Examples:
{examples}

## Fix Instructions
Generate a regex-based search and replace, or describe the AST transformation needed.
Format:
- FIND: <pattern>
- REPLACE: <replacement>
- EXPLANATION: <why this fixes it>
""")

        chain = prompt | self.llm | StrOutputParser()

        try:
            return chain.invoke({
                "pattern": pattern,
                "examples": "\n".join(examples[:5])
            })
        except Exception as e:
            return f"Fix suggestion failed: {e}"


def main():
    """Main analysis pipeline"""
    print("=" * 60)
    print("🔬 HMM Error Analysis + LangChain RAG Pipeline")
    print("=" * 60)

    # Paths
    log_path = Path("logs/svelte-check-full.txt")
    graph_output = Path("logs/error-graph.json")
    analysis_output = Path("logs/hmm-analysis-report.json")

    if not log_path.exists():
        print(f"❌ Log file not found: {log_path}")
        print("   Run: npx svelte-check --output machine > logs/svelte-check-full.txt")
        return

    # Step 1: Parse errors and build graph
    print("\n📊 Step 1: Parsing errors and building graph...")
    graph_builder = ErrorPatternGraph()
    errors = graph_builder.parse_svelte_check_output(str(log_path))
    print(f"   Found {len(errors)} errors across {len(graph_builder.file_errors)} files")

    # Build relationship graph
    graph = graph_builder.build_graph(errors)
    graph_builder.export_graph_json(str(graph_output))
    print(f"   Graph exported to {graph_output}")

    # Get priority files
    priority_files = graph_builder.get_priority_files(20)
    print("\n📁 Top 20 files with most errors:")
    for file_path, count in priority_files:
        print(f"   {count:4d} errors: {file_path}")

    # Step 2: Category distribution
    print("\n📈 Error category distribution:")
    category_counts = Counter(e["category"] for e in errors)
    for category, count in category_counts.most_common():
        pct = count / len(errors) * 100
        print(f"   {count:5d} ({pct:5.1f}%) - {category}")

    # Step 3: HMM analysis
    print("\n🤖 Step 2: HMM sequence analysis...")
    hmm_model = HMMErrorModel(n_hidden_states=4)
    sequences = hmm_model.prepare_sequences(graph_builder.file_errors)
    print(f"   Prepared {len(sequences)} sequences for HMM training")

    if HMM_AVAILABLE and sequences:
        model = hmm_model.train(sequences)
        if model:
            trans_matrix = hmm_model.get_transition_matrix()
            print(f"   Transition matrix shape: {trans_matrix.shape}")

    # Step 4: LangChain RAG analysis
    print("\n🧠 Step 3: LangChain RAG deep analysis...")
    rag_agent = LangChainRAGAgent()

    # Analyze top error clusters
    if rag_agent.llm:
        print("\n   Analyzing 'import_type' error cluster...")
        import_type_errors = [e for e in errors if e["category"] == "import_type"][:10]
        if import_type_errors:
            analysis = rag_agent.analyze_error_cluster(
                import_type_errors,
                context="These are 'import type' used as value errors"
            )
            print(f"\n   Analysis:\n{analysis[:500]}...")

    # Step 5: Generate report
    report = {
        "timestamp": str(Path(log_path).stat().st_mtime),
        "total_errors": len(errors),
        "total_files": len(graph_builder.file_errors),
        "category_distribution": dict(category_counts),
        "priority_files": [{"file": f, "count": c} for f, c in priority_files],
        "graph_stats": {
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
        },
        "hmm_available": HMM_AVAILABLE,
        "langchain_available": LANGCHAIN_AVAILABLE,
    }

    with open(analysis_output, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\n✅ Analysis complete! Report saved to {analysis_output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
