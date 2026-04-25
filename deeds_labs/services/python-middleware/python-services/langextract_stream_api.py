# Phase 70: Language Extraction Service
# Extracts structured data from TypeScript/JavaScript code
# Python 3.12 + tree-sitter + small dependencies

import os
import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Language processing
try:
    from typing import Dict
    from tree_sitter import Language, Parser
    import tree_sitter_typescript
    import tree_sitter_javascript
    TREE_SITTER_AVAILABLE = True
    # Type aliases for when tree_sitter is available
    Tree = Any
except ImportError:
    TREE_SITTER_AVAILABLE = False
    # Fallback types when tree_sitter is not available
    Language = Any
    Parser = Any
    Tree = Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("Initializing FastAPI app...")
app = FastAPI(title="Phase 70 Language Extraction Service", version="1.0.0")
print("FastAPI app initialized successfully")

class ExtractRequest(BaseModel):
    code: str
    language: str = "typescript"  # typescript or javascript
    extract_types: List[str] = ["functions", "classes", "interfaces", "imports", "exports"]

class ExtractResponse(BaseModel):
    functions: List[Dict[str, Any]] = []
    classes: List[Dict[str, Any]] = []
    interfaces: List[Dict[str, Any]] = []
    imports: List[Dict[str, Any]] = []
    exports: List[Dict[str, Any]] = []
    errors: List[str] = []
    backend: str = "tree-sitter"

# Tree-sitter parsers and languages
_language_cache: Dict[str, Language] = {}
_parser_cache: Dict[str, Parser] = {}


def get_ts_language(lang_name: str) -> Language:
    """
    Return a cached tree_sitter.Language for the given language name
    using the new tree-sitter Python API.
    """
    if lang_name in _language_cache:
        return _language_cache[lang_name]

    if lang_name == "typescript":
        # tree_sitter_typescript.language_typescript() → low-level C language
        ts_lang = Language(tree_sitter_typescript.language_typescript())
    elif lang_name == "javascript":
        # tree_sitter_javascript has a language() function
        ts_lang = Language(tree_sitter_javascript.language())
    else:
        raise ValueError(f"Unsupported language: {lang_name}")

    _language_cache[lang_name] = ts_lang
    return ts_lang


def get_parser(language: str) -> Optional[Parser]:
    """
    Return a cached Parser instance bound to the requested language.
    Uses the new API: Parser(Language(...)) instead of parser.language = ...
    """
    if not TREE_SITTER_AVAILABLE:
        return None

    if language in _parser_cache:
        return _parser_cache[language]

    try:
        ts_lang = get_ts_language(language)
        parser = Parser(ts_lang)
        _parser_cache[language] = parser
        return parser
    except Exception as e:
        logger.error(f"Failed to create parser for {language}: {e}")
        return None

def extract_functions(tree: Tree, source_code: str) -> List[Dict[str, Any]]:
    """Extract function definitions"""
    functions = []

    def traverse(node):
        if node.type in ["function_declaration", "function_expression", "arrow_function"]:
            func_info = {
                "name": "",
                "parameters": [],
                "return_type": None,
                "start_line": node.start_point[0] + 1,
                "end_line": node.end_point[0] + 1,
                "body": source_code[node.start_byte:node.end_byte]
            }

            # Extract function name
            for child in node.children:
                if child.type == "identifier":
                    func_info["name"] = source_code[child.start_byte:child.end_byte]
                    break
                elif child.type == "property_identifier":
                    func_info["name"] = source_code[child.start_byte:child.end_byte]
                    break

            # Extract parameters
            for child in node.children:
                if child.type == "formal_parameters":
                    params = []
                    for param in child.children:
                        if param.type == "identifier":
                            params.append(source_code[param.start_byte:param.end_byte])
                    func_info["parameters"] = params
                    break

            functions.append(func_info)

        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return functions

def extract_classes(tree: Tree, source_code: str) -> List[Dict[str, Any]]:
    """Extract class definitions"""
    classes = []

    def traverse(node):
        if node.type == "class_declaration":
            class_info = {
                "name": "",
                "methods": [],
                "properties": [],
                "start_line": node.start_point[0] + 1,
                "end_line": node.end_point[0] + 1
            }

            for child in node.children:
                if child.type == "identifier":
                    class_info["name"] = source_code[child.start_byte:child.end_byte]
                elif child.type == "class_body":
                    # Extract methods and properties
                    for member in child.children:
                        if member.type == "method_definition":
                            method_name = ""
                            for method_child in member.children:
                                if method_child.type == "property_identifier":
                                    method_name = source_code[method_child.start_byte:method_child.end_byte]
                                    break
                            if method_name:
                                class_info["methods"].append(method_name)

            classes.append(class_info)

        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return classes

def extract_interfaces(tree: Tree, source_code: str) -> List[Dict[str, Any]]:
    """Extract interface definitions"""
    interfaces = []

    def traverse(node):
        if node.type == "interface_declaration":
            interface_info = {
                "name": "",
                "properties": [],
                "methods": [],
                "start_line": node.start_point[0] + 1,
                "end_line": node.end_point[0] + 1
            }

            for child in node.children:
                if child.type == "identifier":
                    interface_info["name"] = source_code[child.start_byte:child.end_byte]
                elif child.type == "interface_body":
                    # Extract properties and methods
                    for member in child.children:
                        if member.type == "property_signature":
                            prop_name = ""
                            for prop_child in member.children:
                                if prop_child.type == "property_identifier":
                                    prop_name = source_code[prop_child.start_byte:prop_child.end_byte]
                                    break
                            if prop_name:
                                interface_info["properties"].append(prop_name)

            interfaces.append(interface_info)

        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return interfaces

def extract_imports(tree: Tree, source_code: str) -> List[Dict[str, Any]]:
    """Extract import statements"""
    imports = []

    def traverse(node):
        if node.type == "import_statement":
            import_info = {
                "module": "",
                "imports": [],
                "start_line": node.start_point[0] + 1
            }

            for child in node.children:
                if child.type == "string":
                    import_info["module"] = source_code[child.start_byte:child.end_byte].strip('"\'')
                elif child.type == "named_imports":
                    named_imports = []
                    for named_child in child.children:
                        if named_child.type == "identifier":
                            named_imports.append(source_code[named_child.start_byte:named_child.end_byte])
                    import_info["imports"] = named_imports

            imports.append(import_info)

        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return imports

def extract_exports(tree: Tree, source_code: str) -> List[Dict[str, Any]]:
    """Extract export statements"""
    exports = []

    def traverse(node):
        if node.type == "export_statement":
            export_info = {
                "type": "declaration",
                "names": [],
                "start_line": node.start_point[0] + 1
            }

            for child in node.children:
                if child.type == "identifier":
                    export_info["names"].append(source_code[child.start_byte:child.end_byte])

            exports.append(export_info)

        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return exports

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if TREE_SITTER_AVAILABLE else "limited",
        "backend": "tree-sitter",
        "tree_sitter_available": TREE_SITTER_AVAILABLE,
        "supported_languages": ["typescript", "javascript"] if TREE_SITTER_AVAILABLE else []
    }

@app.post("/extract", response_model=ExtractResponse)
async def extract_code(request: ExtractRequest):
    """Extract structured data from code"""
    if not TREE_SITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Tree-sitter not available")

    parser = get_parser(request.language)
    if not parser:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {request.language}")

    try:
        # Parse the code
        tree = parser.parse(bytes(request.code, "utf8"))

        # Extract requested types
        result = ExtractResponse()

        if "functions" in request.extract_types:
            result.functions = extract_functions(tree, request.code)

        if "classes" in request.extract_types:
            result.classes = extract_classes(tree, request.code)

        if "interfaces" in request.extract_types:
            result.interfaces = extract_interfaces(tree, request.code)

        if "imports" in request.extract_types:
            result.imports = extract_imports(tree, request.code)

        if "exports" in request.extract_types:
            result.exports = extract_exports(tree, request.code)

        return result

    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import sys
    import os
    # Add current directory to path for imports
    sys.path.insert(0, os.path.dirname(__file__))

    print("Starting LangExtract service on port 9002...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9002,
        reload=False,
        log_level="info"
    )