#!/usr/bin/env python3
"""
Analyze TypeScript errors from svelte-check output.
Categorizes errors by type to identify patterns for systematic fixing.
"""
import re
import json
import subprocess
from pathlib import Path
from collections import defaultdict, Counter

def run_svelte_check():
    """Run svelte-check and capture output."""
    try:
        result = subprocess.run(
            ['npx', 'svelte-check', '--threshold', 'error'],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        return result.stdout + result.stderr
    except Exception as e:
        print(f"❌ Error running svelte-check: {e}")
        return ""

def parse_errors(output: str):
    """Parse error output into structured data."""
    errors = []

    # Pattern for error lines
    error_pattern = re.compile(
        r'(?P<file>[^\s]+)\s+(?P<line>\d+):(?P<col>\d+)\s+(?P<severity>\w+):\s+(?P<message>.+)'
    )

    for line in output.split('\n'):
        match = error_pattern.match(line.strip())
        if match:
            errors.append({
                'file': match.group('file'),
                'line': int(match.group('line')),
                'column': int(match.group('col')),
                'severity': match.group('severity'),
                'message': match.group('message')
            })

    return errors

def categorize_errors(errors: list):
    """Categorize errors by type."""
    categories = defaultdict(list)

    patterns = {
        'property_not_exist': r"Property '[^']+' does not exist",
        'type_not_assignable': r"Type '.*' is not assignable to type",
        'cannot_find_name': r"Cannot find name",
        'missing_properties': r"Property '.*' is missing",
        'argument_type': r"Argument of type '.*' is not assignable",
        'parameter_implicitly_any': r"Parameter '.*' implicitly has an 'any' type",
        'return_type_mismatch': r"Type '.*' is not assignable to type '.*' as returned by",
        'index_signature': r"Index signature.*missing",
        'undefined_nullable': r"Object is possibly 'null' or 'undefined'",
        'svelte5_runes': r"(\$state|\$derived|\$props|\$effect|\$bindable)",
        'import_errors': r"Cannot find module|Module.*has no exported member",
        'generic_type': r"Generic type.*requires.*type argument",
    }

    for error in errors:
        msg = error['message']
        categorized = False

        for category, pattern in patterns.items():
            if re.search(pattern, msg, re.IGNORECASE):
                categories[category].append(error)
                categorized = True
                break

        if not categorized:
            categories['other'].append(error)

    return categories

def analyze_file_distribution(errors: list):
    """Find files with most errors."""
    file_errors = Counter(e['file'] for e in errors)
    return file_errors.most_common(30)

def generate_report(categories: dict, file_distribution: list, total_errors: int):
    """Generate markdown report."""
    report = [
        "# TypeScript Error Analysis Report\n",
        f"**Total Errors:** {total_errors}\n",
        f"**Date:** {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n",
        "\n## Error Categories\n"
    ]

    # Category breakdown
    sorted_categories = sorted(categories.items(), key=lambda x: len(x[1]), reverse=True)

    for category, errors in sorted_categories:
        count = len(errors)
        percentage = (count / total_errors * 100) if total_errors > 0 else 0
        report.append(f"\n### {category.replace('_', ' ').title()} ({count} errors - {percentage:.1f}%)\n")

        # Show 3 example errors
        for error in errors[:3]:
            report.append(f"- `{error['file']}:{error['line']}` - {error['message'][:100]}...\n")

    # File distribution
    report.append("\n## Files with Most Errors (Top 30)\n")
    for file, count in file_distribution:
        report.append(f"- `{file}` - {count} errors\n")

    # Recommendations
    report.append("\n## Recommended Actions\n")

    for category, errors in sorted_categories[:5]:
        count = len(errors)
        if count > 100:
            report.append(f"\n### Fix {category.replace('_', ' ').title()} ({count} instances)\n")

            if 'property_not_exist' in category:
                report.append("- Add missing properties to interfaces\n")
                report.append("- Use optional chaining `?.` for nullable properties\n")
            elif 'type_not_assignable' in category:
                report.append("- Update type definitions to match actual usage\n")
                report.append("- Add type assertions where safe\n")
            elif 'svelte5_runes' in category:
                report.append("- Ensure runes are used correctly (no imports needed)\n")
                report.append("- Check $props destructuring syntax\n")
            elif 'import_errors' in category:
                report.append("- Verify module paths are correct\n")
                report.append("- Add missing type definition files\n")
            elif 'undefined_nullable' in category:
                report.append("- Add null checks before accessing properties\n")
                report.append("- Use optional chaining `?.` or nullish coalescing `??`\n")

    return ''.join(report)

def main():
    print("🔍 Running svelte-check...")
    output = run_svelte_check()

    if not output:
        print("❌ No output from svelte-check")
        return

    print("📊 Parsing errors...")
    errors = parse_errors(output)

    if not errors:
        # Try alternative parsing for summary line
        summary_match = re.search(r'found (\d+) error', output)
        if summary_match:
            total = int(summary_match.group(1))
            print(f"✅ Found {total} errors (unable to parse details)")
            print("\nRun: npx svelte-check --threshold error > errors.log")
            print("Then manually inspect errors.log for patterns")
        else:
            print("✅ No errors found!")
        return

    print(f"✅ Parsed {len(errors)} errors")

    print("📋 Categorizing...")
    categories = categorize_errors(errors)

    print("📁 Analyzing file distribution...")
    file_dist = analyze_file_distribution(errors)

    print("📝 Generating report...")
    report = generate_report(categories, file_dist, len(errors))

    # Save report
    report_path = Path(__file__).parent.parent / 'ERROR_ANALYSIS_REPORT.md'
    report_path.write_text(report, encoding='utf-8')

    print(f"\n✅ Report saved to: {report_path}")
    print(f"\n📊 Summary:")
    print(f"   Total errors: {len(errors)}")
    print(f"   Categories: {len(categories)}")
    print(f"   Top category: {sorted(categories.items(), key=lambda x: len(x[1]), reverse=True)[0][0]} ({len(sorted(categories.items(), key=lambda x: len(x[1]), reverse=True)[0][1])} errors)")

    # Print category breakdown
    print(f"\n📋 Category Breakdown:")
    for category, errs in sorted(categories.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
        print(f"   {category:30} {len(errs):5} errors")

if __name__ == '__main__':
    main()
