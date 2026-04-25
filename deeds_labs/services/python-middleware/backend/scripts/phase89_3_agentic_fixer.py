#!/usr/bin/env python3
"""
Phase 89.3: Agentic Svelte 5 Migration Fixer
Uses Phase 89.2 migration metadata to systematically fix Svelte 4 patterns
"""

import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Tuple
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

class AgenticSvelteFixer:
    def __init__(self, workspace: Path, dry_run: bool = False):
        self.workspace = workspace
        self.dry_run = dry_run
        self.qdrant = QdrantClient(host="localhost", port=6333)
        self.fixes_applied = []
        self.backup_dir = workspace / ".migration_backups"

        if not dry_run:
            self.backup_dir.mkdir(exist_ok=True)

    def get_migration_targets(self, priority: str = None, limit: int = 50) -> List[Dict]:
        """Query Qdrant for files needing migration"""
        filters = [
            FieldCondition(
                key="needs_svelte5_migration",
                match=MatchValue(value=True)
            )
        ]

        if priority:
            filters.append(
                FieldCondition(
                    key="migration_priority",
                    match=MatchValue(value=priority)
                )
            )

        # Scroll through results
        response = self.qdrant.scroll(
            collection_name="phase90_cuda_embeddings",
            scroll_filter=Filter(must=filters),
            limit=limit,
            with_payload=True,
            with_vectors=False
        )

        points, _ = response

        # Group by file path
        files = {}
        for point in points:
            filepath = point.payload.get("filePath", "")
            if filepath not in files:
                files[filepath] = {
                    "path": filepath,
                    "priority": point.payload.get("migration_priority", "low"),
                    "flags": point.payload.get("migration_flags", []),
                    "recommendations": point.payload.get("migration_recommendations", []),
                    "errors": []
                }
            files[filepath]["errors"].append({
                "line": point.payload.get("line", 0),
                "col": point.payload.get("col", 0),
                "message": point.payload.get("message", "")
            })

        return list(files.values())

    def backup_file(self, filepath: Path) -> Path:
        """Create backup before modifying"""
        if self.dry_run:
            return None

        backup_path = self.backup_dir / f"{filepath.name}.{filepath.stat().st_mtime_ns}.bak"
        backup_path.write_text(filepath.read_text(encoding='utf-8'), encoding='utf-8')
        return backup_path

    def fix_export_let_props(self, content: str, filepath: Path) -> Tuple[str, List[str]]:
        """
        Convert: export let prop = default;
        To: let { prop = $bindable(default) } = $props();
        """
        changes = []

        # Find all export let declarations
        pattern = r'export\s+let\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?;'
        matches = list(re.finditer(pattern, content))

        if not matches:
            return content, changes

        # Collect all props
        props = []
        for match in matches:
            prop_name = match.group(1)
            prop_type = match.group(2).strip() if match.group(2) else None
            prop_default = match.group(3).strip() if match.group(3) else None
            props.append((prop_name, prop_type, prop_default))

        # Build $props() destructuring
        if filepath.suffix == '.svelte':
            # For .svelte files, use $props() rune
            props_str = ", ".join([
                f"{name} = $bindable({default})" if default else name
                for name, _, default in props
            ])
            new_declaration = f"let {{ {props_str} }} = $props();"
            changes.append(f"Converted {len(props)} export let declarations to $props() rune")
        else:
            # For .ts files in .svelte context, just remove export
            new_declaration = "\n".join([
                f"let {name}{f': {ptype}' if ptype else ''}{f' = {default}' if default else ''};"
                for name, ptype, default in props
            ])
            changes.append(f"Removed export from {len(props)} let declarations")

        # Replace all export let with single $props()
        result = content
        for match in reversed(matches):  # Reverse to maintain positions
            result = result[:match.start()] + result[match.end():]

        # Find script tag and insert $props() after it
        script_pattern = r'(<script[^>]*>)\s*'
        script_match = re.search(script_pattern, result)
        if script_match:
            insert_pos = script_match.end()
            result = result[:insert_pos] + f"\n\t{new_declaration}\n" + result[insert_pos:]
        else:
            # No script tag, add at top
            result = f"<script>\n\t{new_declaration}\n</script>\n\n" + result

        return result, changes

    def fix_reactive_statements(self, content: str) -> Tuple[str, List[str]]:
        """
        Convert: $: derived = compute(prop);
        To: let derived = $derived(compute(prop));
        """
        changes = []

        # Find $: reactive statements
        pattern = r'\$:\s*(\w+)\s*=\s*([^;]+);'
        matches = list(re.finditer(pattern, content))

        if not matches:
            return content, changes

        result = content
        for match in reversed(matches):
            var_name = match.group(1)
            expression = match.group(2).strip()

            # Convert to $derived
            new_statement = f"let {var_name} = $derived({expression});"
            result = result[:match.start()] + new_statement + result[match.end():]
            changes.append(f"Converted reactive statement: ${var_name}")

        return result, changes

    def fix_event_dispatcher(self, content: str) -> Tuple[str, List[str]]:
        """
        Convert: createEventDispatcher()
        To: Event callback props with $props()
        """
        changes = []

        # Check if createEventDispatcher is used
        if 'createEventDispatcher' not in content:
            return content, changes

        # Find dispatcher declarations
        dispatcher_pattern = r'const\s+(\w+)\s*=\s*createEventDispatcher\(\);'
        matches = list(re.finditer(dispatcher_pattern, content))

        if not matches:
            return content, changes

        result = content

        # Find dispatch calls to determine event types
        dispatch_pattern = r'(\w+)\.dispatch\([\'"](\w+)[\'"]\s*(?:,\s*([^)]+))?\)'
        dispatch_calls = re.findall(dispatch_pattern, content)

        # Build event callback props
        event_props = set()
        for dispatcher_name, event_name, _ in dispatch_calls:
            event_props.add(f"on{event_name.capitalize()}")

        # Remove createEventDispatcher import
        result = re.sub(
            r"import\s*\{[^}]*createEventDispatcher[^}]*\}\s*from\s*['\"]svelte['\"];?\s*",
            "",
            result
        )

        # Remove dispatcher declarations
        for match in reversed(matches):
            result = result[:match.start()] + result[match.end():]

        # Replace dispatch calls with callback invocations
        for dispatcher_name, event_name, detail in dispatch_calls:
            callback_name = f"on{event_name.capitalize()}"
            old_call = f"{dispatcher_name}.dispatch('{event_name}'"
            if detail:
                new_call = f"{callback_name}?.({detail})"
            else:
                new_call = f"{callback_name}?.()"
            result = result.replace(old_call, new_call)

        # Add event callback props to $props()
        if event_props:
            props_pattern = r'let\s*\{([^}]+)\}\s*=\s*\$props\(\);'
            props_match = re.search(props_pattern, result)
            if props_match:
                existing_props = props_match.group(1)
                new_props = f"{existing_props}, {', '.join(sorted(event_props))}"
                result = result[:props_match.start(1)] + new_props + result[props_match.end(1):]
            else:
                # Add new $props() declaration
                script_pattern = r'(<script[^>]*>)\s*'
                script_match = re.search(script_pattern, result)
                if script_match:
                    insert_pos = script_match.end()
                    new_props_decl = f"\n\tlet {{ {', '.join(sorted(event_props))} }} = $props();\n"
                    result = result[:insert_pos] + new_props_decl + result[insert_pos:]

        changes.append(f"Converted createEventDispatcher to callback props: {', '.join(sorted(event_props))}")

        return result, changes

    def apply_fixes(self, file_info: Dict) -> Dict:
        """Apply all relevant fixes to a file"""
        filepath = Path(file_info["path"])
        full_path = self.workspace / filepath

        if not full_path.exists():
            return {
                "file": str(filepath),
                "success": False,
                "error": "File not found"
            }

        # Read content
        content = full_path.read_text(encoding='utf-8')
        original_content = content
        all_changes = []

        # Apply fixes based on migration flags
        flags = file_info.get("flags", [])

        if "svelte4_props" in flags:
            content, changes = self.fix_export_let_props(content, full_path)
            all_changes.extend(changes)

        if "svelte4_reactive" in flags:
            content, changes = self.fix_reactive_statements(content)
            all_changes.extend(changes)

        if "svelte4_events" in flags:
            content, changes = self.fix_event_dispatcher(content)
            all_changes.extend(changes)

        # Check if changes were made
        if content == original_content:
            return {
                "file": str(filepath),
                "success": True,
                "changes": [],
                "skipped": "No changes needed"
            }

        # Backup and write
        if not self.dry_run:
            backup_path = self.backup_file(full_path)
            full_path.write_text(content, encoding='utf-8')

        return {
            "file": str(filepath),
            "success": True,
            "changes": all_changes,
            "priority": file_info.get("priority", "low"),
            "dry_run": self.dry_run
        }

    def run(self, priority: str = None, limit: int = 50):
        """Run agentic fixer"""
        print(f"\n{'='*80}")
        print(f"🤖 Phase 89.3: Agentic Svelte 5 Migration Fixer")
        print(f"{'='*80}")
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"Priority: {priority or 'all'}")
        print(f"Limit: {limit} files")
        print()

        # Get targets from Qdrant
        print("📊 Querying Qdrant for migration targets...")
        targets = self.get_migration_targets(priority=priority, limit=limit)
        print(f"   Found {len(targets)} files needing migration")
        print()

        # Process each file
        results = []
        for i, target in enumerate(targets, 1):
            print(f"[{i}/{len(targets)}] Processing: {target['path']}")
            print(f"   Priority: {target['priority']}")
            print(f"   Flags: {', '.join(target['flags'])}")

            result = self.apply_fixes(target)
            results.append(result)

            if result["success"] and result.get("changes"):
                for change in result["changes"]:
                    print(f"   ✓ {change}")
            elif result.get("skipped"):
                print(f"   ⊘ {result['skipped']}")
            elif not result["success"]:
                print(f"   ✗ {result.get('error', 'Unknown error')}")
            print()

        # Summary
        print(f"\n{'='*80}")
        print(f"📊 Migration Summary")
        print(f"{'='*80}")

        successful = [r for r in results if r["success"] and r.get("changes")]
        skipped = [r for r in results if r.get("skipped")]
        failed = [r for r in results if not r["success"]]

        print(f"✓ Successfully migrated: {len(successful)} files")
        print(f"⊘ Skipped (no changes): {len(skipped)} files")
        print(f"✗ Failed: {len(failed)} files")
        print()

        if successful:
            print("Successfully migrated files:")
            for result in successful:
                print(f"   {result['file']} ({result['priority']} priority)")
                for change in result['changes']:
                    print(f"      - {change}")

        if failed:
            print("\nFailed migrations:")
            for result in failed:
                print(f"   {result['file']}: {result.get('error', 'Unknown')}")

        if self.dry_run:
            print(f"\n💡 This was a DRY RUN. No files were modified.")
            print(f"   Run without --dry-run to apply changes.")
        else:
            print(f"\n✅ Migration complete!")
            print(f"   Backups stored in: {self.backup_dir}")

        return results


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 89.3: Agentic Svelte 5 Fixer")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    parser.add_argument("--priority", choices=["critical", "high", "medium", "low"], help="Filter by priority")
    parser.add_argument("--limit", type=int, default=50, help="Max files to process")
    parser.add_argument("--workspace", type=Path, default=Path("sveltekit-frontend"), help="Workspace path")

    args = parser.parse_args()

    fixer = AgenticSvelteFixer(
        workspace=args.workspace,
        dry_run=args.dry_run
    )

    results = fixer.run(
        priority=args.priority,
        limit=args.limit
    )

    # Exit code based on results
    failed = [r for r in results if not r["success"]]
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
