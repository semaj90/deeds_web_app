#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Comment Extraction Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Extract comments from TypeScript/Svelte files using ripgrep
Task: 4.1 - Create comment extraction utility
═══════════════════════════════════════════════════════════════════════
"""

import os
import re
import subprocess
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CommentType(Enum):
    """Comment type enum."""
    SINGLE_LINE = "single_line"  # // comment
    MULTI_LINE = "multi_line"    # /* comment */
    JSDOC = "jsdoc"              # /** @param ... */
    TODO = "todo"                # // TODO: ...
    FIXME = "fixme"              # // FIXME: ...
    HACK = "hack"                # // HACK: ...
    NOTE = "note"                # // NOTE: ...


@dataclass
class JSDocTag:
    """JSDoc tag."""
    tag: str  # @param, @returns, @description, etc.
    name: Optional[str] = None  # Parameter name
    type: Optional[str] = None  # Type annotation
    description: Optional[str] = None


@dataclass
class Comment:
    """Comment with metadata."""
    text: str
    file_path: str
    line_number: int
    comment_type: CommentType
    context_before: List[str] = field(default_factory=list)
    context_after: List[str] = field(default_factory=list)
    jsdoc_tags: List[JSDocTag] = field(default_factory=list)
    marker_type: Optional[str] = None  # TODO, FIXME, HACK, NOTE


class CommentExtractionService:
    """
    Extract comments from TypeScript/Svelte files using ripgrep.

    Features:
    - Fast comment extraction with ripgrep
    - Parse JSDoc comments (@param, @returns, @description)
    - Extract TODO/FIXME/HACK/NOTE markers
    - Return structured Comment objects with line numbers
    """

    def __init__(self):
        """Initialize comment extraction service."""
        self.ripgrep_available = self._check_ripgrep()
        logger.info(f"🔍 CommentExtractionService initialized (ripgrep: {self.ripgrep_available})")

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
            logger.warning("⚠️  ripgrep not found - falling back to Python regex")
            return False

    async def extract_comments(
        self,
        file_path: str,
        include_context: bool = True,
        context_lines: int = 2
    ) -> List[Comment]:
        """
        Extract all comments from a file.

        Args:
            file_path: Path to file
            include_context: Include context lines before/after comment
            context_lines: Number of context lines (default: 2)

        Returns:
            List of Comment objects
        """
        logger.info(f"📝 Extracting comments from: {file_path}")

        if self.ripgrep_available:
            comments = await self._extract_with_ripgrep(file_path, include_context, context_lines)
        else:
            comments = await self._extract_with_regex(file_path, include_context, context_lines)

        # Parse JSDoc comments
        for comment in comments:
            if comment.comment_type == CommentType.JSDOC:
                comment.jsdoc_tags = self._parse_jsdoc(comment.text)

        # Detect markers (TODO, FIXME, etc.)
        for comment in comments:
            comment.marker_type = self._detect_marker(comment.text)
            if comment.marker_type:
                comment.comment_type = CommentType[comment.marker_type.upper()]

        logger.info(f"✅ Extracted {len(comments)} comments")
        return comments

    async def _extract_with_ripgrep(
        self,
        file_path: str,
        include_context: bool,
        context_lines: int
    ) -> List[Comment]:
        """Extract comments using ripgrep."""
        comments = []

        try:
            # Ripgrep pattern for comments
            # Matches: // comment, /* comment */, /** jsdoc */
            pattern = r"(//.*|/\*[\s\S]*?\*/)"

            # Build ripgrep command
            cmd = [
                "rg",
                "--line-number",
                "--no-heading",
                "--color=never",
                pattern,
                file_path
            ]

            if include_context:
                cmd.extend(["-C", str(context_lines)])

            # Run ripgrep
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                # Parse ripgrep output
                lines = result.stdout.strip().split("\n")
                comments = self._parse_ripgrep_output(lines, file_path)

        except subprocess.TimeoutExpired:
            logger.error(f"❌ ripgrep timeout for {file_path}")
        except Exception as e:
            logger.error(f"❌ ripgrep error: {e}")

        return comments

    def _parse_ripgrep_output(self, lines: List[str], file_path: str) -> List[Comment]:
        """Parse ripgrep output into Comment objects."""
        comments = []
        current_comment = None
        context_before = []
        context_after = []

        for line in lines:
            # Parse line: "123:// comment" or "123-context line"
            if ":" in line:
                parts = line.split(":", 1)
                if len(parts) == 2 and parts[0].isdigit():
                    line_number = int(parts[0])
                    text = parts[1].strip()

                    # Detect comment type
                    comment_type = self._detect_comment_type(text)

                    # Create comment
                    comment = Comment(
                        text=text,
                        file_path=file_path,
                        line_number=line_number,
                        comment_type=comment_type,
                        context_before=context_before.copy(),
                    )
                    comments.append(comment)

                    # Reset context
                    context_before = []
                    current_comment = comment

            elif "-" in line and current_comment:
                # Context line
                parts = line.split("-", 1)
                if len(parts) == 2:
                    context_line = parts[1].strip()
                    if current_comment:
                        current_comment.context_after.append(context_line)
                    else:
                        context_before.append(context_line)

        return comments

    async def _extract_with_regex(
        self,
        file_path: str,
        include_context: bool,
        context_lines: int
    ) -> List[Comment]:
        """Extract comments using Python regex (fallback)."""
        comments = []

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            lines = content.split("\n")

            # Single-line comments: // comment
            single_line_pattern = r"//.*"

            # Multi-line comments: /* comment */
            multi_line_pattern = r"/\*[\s\S]*?\*/"

            # Find all comments
            for i, line in enumerate(lines, 1):
                # Single-line comments
                match = re.search(single_line_pattern, line)
                if match:
                    text = match.group(0).strip()
                    comment_type = self._detect_comment_type(text)

                    comment = Comment(
                        text=text,
                        file_path=file_path,
                        line_number=i,
                        comment_type=comment_type,
                    )

                    if include_context:
                        comment.context_before = self._get_context_lines(
                            lines, i, context_lines, before=True
                        )
                        comment.context_after = self._get_context_lines(
                            lines, i, context_lines, before=False
                        )

                    comments.append(comment)

            # Multi-line comments
            for match in re.finditer(multi_line_pattern, content):
                text = match.group(0).strip()
                line_number = content[:match.start()].count("\n") + 1
                comment_type = self._detect_comment_type(text)

                comment = Comment(
                    text=text,
                    file_path=file_path,
                    line_number=line_number,
                    comment_type=comment_type,
                )

                if include_context:
                    comment.context_before = self._get_context_lines(
                        lines, line_number, context_lines, before=True
                    )
                    comment.context_after = self._get_context_lines(
                        lines, line_number, context_lines, before=False
                    )

                comments.append(comment)

        except Exception as e:
            logger.error(f"❌ Regex extraction error: {e}")

        return comments

    def _detect_comment_type(self, text: str) -> CommentType:
        """Detect comment type from text."""
        text_lower = text.lower()

        if text.startswith("/**"):
            return CommentType.JSDOC
        elif "todo:" in text_lower or "todo " in text_lower:
            return CommentType.TODO
        elif "fixme:" in text_lower or "fixme " in text_lower:
            return CommentType.FIXME
        elif "hack:" in text_lower or "hack " in text_lower:
            return CommentType.HACK
        elif "note:" in text_lower or "note " in text_lower:
            return CommentType.NOTE
        elif text.startswith("/*"):
            return CommentType.MULTI_LINE
        else:
            return CommentType.SINGLE_LINE

    def _detect_marker(self, text: str) -> Optional[str]:
        """Detect marker type (TODO, FIXME, HACK, NOTE)."""
        text_lower = text.lower()

        if "todo:" in text_lower or "todo " in text_lower:
            return "todo"
        elif "fixme:" in text_lower or "fixme " in text_lower:
            return "fixme"
        elif "hack:" in text_lower or "hack " in text_lower:
            return "hack"
        elif "note:" in text_lower or "note " in text_lower:
            return "note"

        return None

    def _parse_jsdoc(self, text: str) -> List[JSDocTag]:
        """Parse JSDoc tags from comment text."""
        tags = []

        # Extract JSDoc tags: @param {type} name description
        tag_pattern = r"@(\w+)\s*(?:\{([^}]+)\})?\s*(\w+)?\s*(.*)"

        for line in text.split("\n"):
            line = line.strip().lstrip("*").strip()
            match = re.match(tag_pattern, line)

            if match:
                tag_name = match.group(1)
                type_annotation = match.group(2)
                param_name = match.group(3)
                description = match.group(4).strip()

                tag = JSDocTag(
                    tag=tag_name,
                    type=type_annotation,
                    name=param_name,
                    description=description if description else None
                )
                tags.append(tag)

        return tags

    def _get_context_lines(
        self,
        lines: List[str],
        line_number: int,
        context_lines: int,
        before: bool
    ) -> List[str]:
        """Get context lines before or after a line."""
        if before:
            start = max(0, line_number - context_lines - 1)
            end = line_number - 1
            return lines[start:end]
        else:
            start = line_number
            end = min(len(lines), line_number + context_lines)
            return lines[start:end]

    async def extract_todos(self, file_path: str) -> List[Comment]:
        """Extract only TODO comments."""
        all_comments = await self.extract_comments(file_path)
        return [c for c in all_comments if c.comment_type == CommentType.TODO]

    async def extract_fixmes(self, file_path: str) -> List[Comment]:
        """Extract only FIXME comments."""
        all_comments = await self.extract_comments(file_path)
        return [c for c in all_comments if c.comment_type == CommentType.FIXME]

    async def extract_jsdoc(self, file_path: str) -> List[Comment]:
        """Extract only JSDoc comments."""
        all_comments = await self.extract_comments(file_path)
        return [c for c in all_comments if c.comment_type == CommentType.JSDOC]


# Example usage
async def example_usage():
    """Example of using the CommentExtractionService."""
    service = CommentExtractionService()

    # Extract all comments
    file_path = "sveltekit-frontend/src/lib/components/ui/Button.svelte"
    comments = await service.extract_comments(file_path)

    print(f"\n📝 Comment Extraction Results:")
    print(f"   Total comments: {len(comments)}")

    # Group by type
    by_type = {}
    for comment in comments:
        comment_type = comment.comment_type.value
        by_type[comment_type] = by_type.get(comment_type, 0) + 1

    print(f"\n   By type:")
    for comment_type, count in by_type.items():
        print(f"      {comment_type}: {count}")

    # Show TODOs
    todos = await service.extract_todos(file_path)
    if todos:
        print(f"\n   TODOs:")
        for todo in todos:
            print(f"      Line {todo.line_number}: {todo.text}")

    # Show JSDoc
    jsdocs = await service.extract_jsdoc(file_path)
    if jsdocs:
        print(f"\n   JSDoc comments:")
        for jsdoc in jsdocs:
            print(f"      Line {jsdoc.line_number}: {len(jsdoc.jsdoc_tags)} tags")
            for tag in jsdoc.jsdoc_tags:
                print(f"         @{tag.tag} {tag.name or ''} {tag.type or ''}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(example_usage())
