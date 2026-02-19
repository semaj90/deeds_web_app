#!/usr/bin/env python3
"""
Phase 46: AST Graph Extractor for Code Intelligence
Extracts AST graphs from TypeScript, Svelte, CUDA, and C++ files
"""

import os
import json
import ast
import re
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import subprocess
import sys

@dataclass
class ASTNode:
    """Represents a node in the AST graph"""
    id: str
    type: str
    name: str = ""
    content: str = ""
    start_line: int = 0
    end_line: int = 0
    children: List[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.children is None:
            self.children = []
        if self.metadata is None:
            self.metadata = {}

@dataclass
class CodeFile:
    """Represents a parsed code file with AST"""
    filepath: str
    language: str
    content: str
    ast_nodes: List[ASTNode]
    imports: List[str]
    exports: List[str]
    functions: List[str]
    classes: List[str]

class ASTExtractor:
    """Multi-language AST extractor"""

    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir)
        self.supported_extensions = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.svelte': 'svelte',
            '.cu': 'cuda',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'cpp',
            '.hpp': 'cpp'
        }

    def extract_from_directory(self, output_file: str = "ast_graph.jsonl") -> None:
        """Extract AST from all supported files in directory"""
        all_files = []

        for ext in self.supported_extensions.keys():
            all_files.extend(self.root_dir.rglob(f"*{ext}"))

        print(f"Found {len(all_files)} code files to process")

        with open(output_file, 'w', encoding='utf-8') as f:
            for filepath in all_files:
                try:
                    code_file = self.extract_from_file(filepath)
                    if code_file:
                        json.dump(asdict(code_file), f, ensure_ascii=False)
                        f.write('\n')
                        print(f"✓ Processed {filepath}")
                except Exception as e:
                    print(f"✗ Failed to process {filepath}: {e}")

    def extract_from_file(self, filepath: Path) -> Optional[CodeFile]:
        """Extract AST from a single file"""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            language = self.supported_extensions.get(filepath.suffix.lower())
            if not language:
                return None

            # Extract AST based on language
            if language in ['typescript', 'javascript']:
                return self._extract_js_ts(filepath, content, language)
            elif language == 'svelte':
                return self._extract_svelte(filepath, content)
            elif language == 'cuda':
                return self._extract_cuda(filepath, content)
            elif language == 'cpp':
                return self._extract_cpp(filepath, content)
            else:
                return None

        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            return None

    def _extract_js_ts(self, filepath: Path, content: str, language: str) -> CodeFile:
        """Extract AST from JavaScript/TypeScript"""
        ast_nodes = []
        imports = []
        exports = []
        functions = []
        classes = []

        try:
            # Use tree-sitter or simple regex for now
            # Extract imports
            import_matches = re.findall(r'import\s+.*?\s+from\s+[\'"](.*?)[\'"]', content)
            imports.extend(import_matches)

            # Extract exports
            export_matches = re.findall(r'export\s+(?:const|let|var|function|class)\s+(\w+)', content)
            exports.extend(export_matches)

            # Extract functions
            func_matches = re.findall(r'(?:function|const|let|var)\s+(\w+)\s*\([^)]*\)\s*{', content)
            functions.extend(func_matches)

            # Extract classes
            class_matches = re.findall(r'class\s+(\w+)', content)
            classes.extend(class_matches)

            # Create basic AST nodes
            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                if line.strip():
                    node = ASTNode(
                        id=f"{filepath.name}:{i}",
                        type="statement",
                        content=line.strip(),
                        start_line=i,
                        end_line=i
                    )
                    ast_nodes.append(node)

        except Exception as e:
            print(f"JS/TS parsing error: {e}")

        return CodeFile(
            filepath=str(filepath),
            language=language,
            content=content,
            ast_nodes=ast_nodes,
            imports=imports,
            exports=exports,
            functions=functions,
            classes=classes
        )

    def _extract_svelte(self, filepath: Path, content: str) -> CodeFile:
        """Extract AST from Svelte files"""
        ast_nodes = []
        imports = []
        exports = []
        functions = []
        classes = []

        # Split Svelte file into script, template, style
        script_match = re.search(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
        if script_match:
            script_content = script_match.group(1)
            # Parse as TypeScript
            script_file = self._extract_js_ts(filepath, script_content, 'typescript')
            if script_file:
                imports = script_file.imports
                exports = script_file.exports
                functions = script_file.functions
                classes = script_file.classes

        # Extract template and style sections
        template_match = re.search(r'<template[^>]*>(.*?)</template>', content, re.DOTALL)
        if template_match:
            template_content = template_match.group(1)
            node = ASTNode(
                id=f"{filepath.name}:template",
                type="template",
                content=template_content.strip(),
                start_line=content[:template_match.start()].count('\n') + 1,
                end_line=content[:template_match.end()].count('\n') + 1
            )
            ast_nodes.append(node)

        style_match = re.search(r'<style[^>]*>(.*?)</style>', content, re.DOTALL)
        if style_match:
            style_content = style_match.group(1)
            node = ASTNode(
                id=f"{filepath.name}:style",
                type="style",
                content=style_content.strip(),
                start_line=content[:style_match.start()].count('\n') + 1,
                end_line=content[:style_match.end()].count('\n') + 1
            )
            ast_nodes.append(node)

        return CodeFile(
            filepath=str(filepath),
            language='svelte',
            content=content,
            ast_nodes=ast_nodes,
            imports=imports,
            exports=exports,
            functions=functions,
            classes=classes
        )

    def _extract_cuda(self, filepath: Path, content: str) -> CodeFile:
        """Extract AST from CUDA files"""
        ast_nodes = []
        imports = []
        exports = []
        functions = []
        classes = []

        # Extract kernel functions
        kernel_matches = re.findall(r'__global__\s+void\s+(\w+)\s*\([^)]*\)', content)
        functions.extend([f"kernel:{k}" for k in kernel_matches])

        # Extract device functions
        device_matches = re.findall(r'__device__\s+\w+\s+(\w+)\s*\([^)]*\)', content)
        functions.extend([f"device:{d}" for d in device_matches])

        # Basic line-by-line AST
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            if line.strip():
                node_type = "kernel" if "__global__" in line else "device" if "__device__" in line else "statement"
                node = ASTNode(
                    id=f"{filepath.name}:{i}",
                    type=node_type,
                    content=line.strip(),
                    start_line=i,
                    end_line=i
                )
                ast_nodes.append(node)

        return CodeFile(
            filepath=str(filepath),
            language='cuda',
            content=content,
            ast_nodes=ast_nodes,
            imports=imports,
            exports=exports,
            functions=functions,
            classes=classes
        )

    def _extract_cpp(self, filepath: Path, content: str) -> CodeFile:
        """Extract AST from C++ files"""
        ast_nodes = []
        imports = []
        exports = []
        functions = []
        classes = []

        # Extract includes
        include_matches = re.findall(r'#include\s+[<"](.*?)[>"]', content)
        imports.extend(include_matches)

        # Extract functions
        func_matches = re.findall(r'(?:void|int|float|double|char)\s+(\w+)\s*\([^)]*\)\s*{', content)
        functions.extend(func_matches)

        # Extract classes
        class_matches = re.findall(r'class\s+(\w+)', content)
        classes.extend(class_matches)

        # Basic line-by-line AST
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            if line.strip():
                node_type = "include" if line.strip().startswith("#include") else "function" if "{" in line and "(" in line else "statement"
                node = ASTNode(
                    id=f"{filepath.name}:{i}",
                    type=node_type,
                    content=line.strip(),
                    start_line=i,
                    end_line=i
                )
                ast_nodes.append(node)

        return CodeFile(
            filepath=str(filepath),
            language='cpp',
            content=content,
            ast_nodes=ast_nodes,
            imports=imports,
            exports=exports,
            functions=functions,
            classes=classes
        )

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python extract_ast_graph.py <source_directory> [output_file]")
        sys.exit(1)

    source_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "ast_graph.jsonl"

    extractor = ASTExtractor(source_dir)
    extractor.extract_from_directory(output_file)
    print(f"AST extraction complete. Output saved to {output_file}")

if __name__ == "__main__":
    main()