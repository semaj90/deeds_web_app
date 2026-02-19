#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Pattern Search Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Search for code patterns using ripgrep + awk
Task: 4.2 - Create pattern search utility
═══════════════════════════════════════════════════════════════════════
"""

import os
import subprocess
import logging
from typing import List, Optional, Dict, Any, Set
from dataclasses import dataclass, field
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PatternType(Enum):
    """Pattern type enum."""
    FUNCTION_CALL = "function_call"
    IMPORT_STATEMENT = "import_statement"
    VARIABLE_USAGE = "variable_usage"
    CLASS_USAGE = "class_usage"
    COMPONENT_USAGE = "component_usage"
    API_CALL = "api_call"
    STATE_USAGE = "state_usage"
    PROP_USAGE = "prop_usage"


@dataclass
class Pattern:
    """Code pattern with context."""
    text: str
    file: str
    line: int
    column: int
    pattern_type: PatternType
    context: List[str] = field(default_factory=list)
    matched_symbol: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PatternSearchResult:
    """Pattern search result."""
    query: str
    patterns: List[Pattern] = field(default_factory=list)
    total_matches: int = 0
    files_searched: int = 0
    search_time_ms: float = 0.0


class PatternSearchService:
    """
    Search for code patterns using ripgrep + awk.

    Features:
    - Fast pattern search with ripgrep
    - Pattern extraction with awk
    - Search for function calls, imports, variable usage
    - Return Pattern objects with file, line, context
    """

    def __init__(self, workspace_root: Optional[str] = None):
        """Initialize pattern search service."""
        self.workspace_root = workspace_root or os.getcwd()
        self.ripgrep_available = self._check_ripgrep()
        self.awk_available = self._check_awk()
        logger.info(
            f"🔍 PatternSearchService initialized "
            f"(ripgrep: {self.ripgrep_available}, awk: {self.awk_available})"
        )

    def _check_ripgrep(self) -> bool:
        """Check if ripgrep is available."""
        try:
            subprocess.run(
                ["rg", "--version"],
                capture_output=True,
                check=True,
                timeout=5
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("⚠️  ripgrep not found")
            return False

    def _check_awk(self) -> bool:
        """Check if awk is available."""
        try:
            subprocess.run(
                ["awk", "--version"],
                capture_output=True,
                check=True,
                timeout=5
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("⚠️  awk not found")
            return False

    async def search_function_calls(
        self,
        function_name: str,
        file_pattern: str = "*.{ts,tsx,js,jsx,svelte}",
        context_lines: int = 2
    ) -> PatternSearchResult:
        """
        Search for function calls.

        Args:
            function_name: Function name to search for
            file_pattern: File pattern (default: TypeScript/Svelte files)
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for function calls: {function_name}")

        # Ripgrep pattern: functionName(
        pattern = rf"\b{function_name}\s*\("

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.FUNCTION_CALL,
            function_name
        )

        logger.info(f"✅ Found {result.total_matches} function calls")
        return result

    async def search_imports(
        self,
        module_name: str,
        file_pattern: str = "*.{ts,tsx,js,jsx,svelte}",
        context_lines: int = 1
    ) -> PatternSearchResult:
        """
        Search for import statements.

        Args:
            module_name: Module name to search for
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for imports: {module_name}")

        # Ripgrep pattern: import ... from 'module'
        pattern = rf"import\s+.*\s+from\s+['\"].*{module_name}.*['\"]"

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.IMPORT_STATEMENT,
            module_name
        )

        logger.info(f"✅ Found {result.total_matches} imports")
        return result

    async def search_variable_usage(
        self,
        variable_name: str,
        file_pattern: str = "*.{ts,tsx,js,jsx,svelte}",
        context_lines: int = 2
    ) -> PatternSearchResult:
        """
        Search for variable usage.

        Args:
            variable_name: Variable name to search for
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for variable usage: {variable_name}")

        # Ripgrep pattern: word boundary
        pattern = rf"\b{variable_name}\b"

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.VARIABLE_USAGE,
            variable_name
        )

        logger.info(f"✅ Found {result.total_matches} variable usages")
        return result

    async def search_component_usage(
        self,
        component_name: str,
        file_pattern: str = "*.{svelte,tsx,jsx}",
        context_lines: int = 2
    ) -> PatternSearchResult:
        """
        Search for component usage (JSX/Svelte).

        Args:
            component_name: Component name to search for
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for component usage: {component_name}")

        # Ripgrep pattern: <ComponentName
        pattern = rf"<{component_name}\b"

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.COMPONENT_USAGE,
            component_name
        )

        logger.info(f"✅ Found {result.total_matches} component usages")
        return result

    async def search_api_calls(
        self,
        api_path: str,
        file_pattern: str = "*.{ts,tsx,js,jsx,svelte}",
        context_lines: int = 2
    ) -> PatternSearchResult:
        """
        Search for API calls (fetch, axios, etc.).

        Args:
            api_path: API path to search for
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for API calls: {api_path}")

        # Ripgrep pattern: fetch('/api/path') or axios.get('/api/path')
        pattern = rf"(fetch|axios\.\w+)\s*\(['\"].*{api_path}.*['\"]"

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.API_CALL,
            api_path
        )

        logger.info(f"✅ Found {result.total_matches} API calls")
        return result

    async def search_state_usage(
        self,
        state_name: str,
        file_pattern: str = "*.{svelte,tsx,jsx}",
        context_lines: int = 2
    ) -> PatternSearchResult:
        """
        Search for state usage (Svelte $state, React useState).

        Args:
            state_name: State variable name
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            PatternSearchResult with matches
        """
        logger.info(f"🔍 Searching for state usage: {state_name}")

        # Ripgrep pattern: $state or useState
        pattern = rf"(\$state\(.*{state_name}.*\)|useState.*{state_name})"

        result = await self._search_with_ripgrep(
            pattern,
            file_pattern,
            context_lines,
            PatternType.STATE_USAGE,
            state_name
        )

        logger.info(f"✅ Found {result.total_matches} state usages")
        return result

    async def search_related_patterns(
        self,
        symbol: str,
        file_pattern: str = "*.{ts,tsx,js,jsx,svelte}",
        context_lines: int = 2
    ) -> List[PatternSearchResult]:
        """
        Search for all related patterns (function calls, imports, usage).

        Args:
            symbol: Symbol to search for
            file_pattern: File pattern
            context_lines: Number of context lines

        Returns:
            List of PatternSearchResult for each pattern type
        """
        logger.info(f"🔍 Searching for related patterns: {symbol}")

        results = []

        # Search function calls
        function_calls = await self.search_function_calls(symbol, file_pattern, context_lines)
        if function_calls.total_matches > 0:
            results.append(function_calls)

        # Search imports
        imports = await self.search_imports(symbol, file_pattern, context_lines)
        if imports.total_matches > 0:
            results.append(imports)

        # Search variable usage
        variable_usage = await self.search_variable_usage(symbol, file_pattern, context_lines)
        if variable_usage.total_matches > 0:
            results.append(variable_usage)

        # Search component usage
        component_usage = await self.search_component_usage(symbol, file_pattern, context_lines)
        if component_usage.total_matches > 0:
            results.append(component_usage)

        total_matches = sum(r.total_matches for r in results)
        logger.info(f"✅ Found {total_matches} related patterns across {len(results)} types")

        return results

    async def _search_with_ripgrep(
        self,
        pattern: str,
        file_pattern: str,
        context_lines: int,
        pattern_type: PatternType,
        matched_symbol: str
    ) -> PatternSearchResult:
        """Search with ripgrep and parse results."""
        import time

        start_time = time.time()
        result = PatternSearchResult(query=pattern)

        if not self.ripgrep_available:
            logger.warning("⚠️  ripgrep not available - returning empty result")
            return result

        try:
            # Build ripgrep command
            cmd = [
                "rg",
                "--line-number",
                "--column",
                "--no-heading",
                "--color=never",
                "--glob", file_pattern,
                "-C", str(context_lines),
                pattern,
                self.workspace_root
            ]

            # Run ripgrep
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if process.returncode == 0:
                # Parse ripgrep output
                patterns = self._parse_ripgrep_output(
                    process.stdout,
                    pattern_type,
                    matched_symbol
                )
                result.patterns = patterns
                result.total_matches = len(patterns)

                # Count unique files
                unique_files = set(p.file for p in patterns)
                result.files_searched = len(unique_files)

        except subprocess.TimeoutExpired:
            logger.error(f"❌ ripgrep timeout for pattern: {pattern}")
        except Exception as e:
            logger.error(f"❌ ripgrep error: {e}")

        result.search_time_ms = (time.time() - start_time) * 1000
        return result

    def _parse_ripgrep_output(
        self,
        output: str,
        pattern_type: PatternType,
        matched_symbol: str
    ) -> List[Pattern]:
        """Parse ripgrep output into Pattern objects."""
        patterns = []
        lines = output.strip().split("\n")

        current_pattern = None
        context_lines = []

        for line in lines:
            if not line:
                continue

            # Parse line: "file:line:column:text" or "file-line-context"
            if ":" in line:
                parts = line.split(":", 3)
                if len(parts) >= 4:
                    file_path = parts[0]
                    line_number = int(parts[1])
                    column = int(parts[2])
                    text = parts[3]

                    # Create pattern
                    pattern = Pattern(
                        text=text.strip(),
                        file=file_path,
                        line=line_number,
                        column=column,
                        pattern_type=pattern_type,
                        matched_symbol=matched_symbol,
                        context=context_lines.copy()
                    )
                    patterns.append(pattern)

                    # Reset context
                    context_lines = []
                    current_pattern = pattern

            elif "-" in line and current_pattern:
                # Context line
                parts = line.split("-", 2)
                if len(parts) >= 3:
                    context_text = parts[2].strip()
                    current_pattern.context.append(context_text)

        return patterns

    async def extract_with_awk(
        self,
        file_path: str,
        awk_script: str
    ) -> List[str]:
        """
        Extract patterns using awk.

        Args:
            file_path: File to process
            awk_script: Awk script to run

        Returns:
            List of extracted lines
        """
        if not self.awk_available:
            logger.warning("⚠️  awk not available")
            return []

        try:
            cmd = ["awk", awk_script, file_path]

            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )

            if process.returncode == 0:
                return process.stdout.strip().split("\n")

        except subprocess.TimeoutExpired:
            logger.error(f"❌ awk timeout for {file_path}")
        except Exception as e:
            logger.error(f"❌ awk error: {e}")

        return []


# Example usage
async def example_usage():
    """Example of using the PatternSearchService."""
    service = PatternSearchService()

    # Search for function calls
    result = await service.search_function_calls("createEnhancedTag")
    print(f"\n🔍 Function Calls:")
    print(f"   Total matches: {result.total_matches}")
    print(f"   Files searched: {result.files_searched}")
    print(f"   Search time: {result.search_time_ms:.2f}ms")

    if result.patterns:
        print(f"\n   First 3 matches:")
        for pattern in result.patterns[:3]:
            print(f"      {pattern.file}:{pattern.line} - {pattern.text}")

    # Search for imports
    result = await service.search_imports("multi_db_coordinator")
    print(f"\n🔍 Imports:")
    print(f"   Total matches: {result.total_matches}")

    # Search for related patterns
    results = await service.search_related_patterns("Button")
    print(f"\n🔍 Related Patterns:")
    for result in results:
        print(f"   {result.patterns[0].pattern_type.value}: {result.total_matches} matches")


if __name__ == "__main__":
    import asyncio
    asyncio.run(example_usage())
