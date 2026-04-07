#!/usr/bin/env python3
"""
TypeScript Error Analysis and Systematic Fix Report Generator
Analyzes 23,292 TypeScript errors and creates targeted fix strategies
"""

import os
import re
import subprocess
import json
from collections import defaultdict, Counter
from pathlib import Path

def run_tsc_analysis():
    """Get full TypeScript error output for analysis"""
    try:
        result = subprocess.run(
            ['npx', 'tsc', '--noEmit'],
            capture_output=True,
            text=True,
            cwd='.',
            timeout=180
        )
        return result.stderr
    except Exception as e:
        print(f"Error running TypeScript analysis: {e}")
        return ""

def parse_error_line(line):
    """Parse TypeScript error line into structured data"""
    # Pattern: filepath(line,col): error TSXXXX: message
    pattern = r'^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$'
    match = re.match(pattern, line.strip())

    if match:
        return {
            'file': match.group(1),
            'line': int(match.group(2)),
            'column': int(match.group(3)),
            'code': match.group(4),
            'message': match.group(5),
            'raw_line': line.strip()
        }
    return None

def categorize_errors(errors):
    """Categorize errors by type and create fix strategies"""
    categories = {
        'TS1005': {
            'name': 'Syntax Errors (Missing Brackets/Parentheses)',
            'errors': [],
            'patterns': defaultdict(list),
            'fix_strategy': 'Pattern-based bracket/parenthesis completion'
        },
        'TS1128': {
            'name': 'Declaration/Statement Issues',
            'errors': [],
            'patterns': defaultdict(list),
            'fix_strategy': 'Structure repair and declaration fixing'
        },
        'TS1434': {
            'name': 'Unexpected Keywords/Identifiers',
            'errors': [],
            'patterns': defaultdict(list),
            'fix_strategy': 'Keyword placement and syntax correction'
        },
        'OTHER': {
            'name': 'Other TypeScript Errors',
            'errors': [],
            'patterns': defaultdict(list),
            'fix_strategy': 'Case-by-case analysis required'
        }
    }

    for error in errors:
        code = error['code']
        category = categories.get(code, categories['OTHER'])
        category['errors'].append(error)

        # Pattern analysis for each category
        if code == 'TS1005':
            if "'>' expected" in error['message']:
                category['patterns']['missing_generic_bracket'].append(error)
            elif "')' expected" in error['message']:
                category['patterns']['missing_parenthesis'].append(error)
            elif "';' expected" in error['message']:
                category['patterns']['missing_semicolon'].append(error)
            elif "',' expected" in error['message']:
                category['patterns']['missing_comma'].append(error)

        elif code == 'TS1128':
            if "Declaration or statement expected" in error['message']:
                category['patterns']['declaration_expected'].append(error)
            elif "Property or signature expected" in error['message']:
                category['patterns']['property_expected'].append(error)

        elif code == 'TS1434':
            category['patterns']['unexpected_keyword'].append(error)

    return categories

def analyze_file_impact(errors):
    """Analyze which files are most affected"""
    file_errors = defaultdict(list)

    for error in errors:
        file_errors[error['file']].append(error)

    # Sort by error count
    sorted_files = sorted(file_errors.items(), key=lambda x: len(x[1]), reverse=True)

    return {
        'total_files_affected': len(file_errors),
        'most_affected_files': sorted_files[:20],  # Top 20 most problematic files
        'file_error_distribution': {
            '1-5 errors': len([f for f, errs in file_errors.items() if 1 <= len(errs) <= 5]),
            '6-20 errors': len([f for f, errs in file_errors.items() if 6 <= len(errs) <= 20]),
            '21-50 errors': len([f for f, errs in file_errors.items() if 21 <= len(errs) <= 50]),
            '51+ errors': len([f for f, errs in file_errors.items() if len(errs) > 50])
        }
    }

def generate_fix_strategies(categories):
    """Generate specific fix strategies for each error category"""
    strategies = {}

    # TS1005 Strategies
    ts1005 = categories['TS1005']
    strategies['TS1005'] = {
        'priority': 'HIGH',
        'estimated_impact': f"{len(ts1005['errors'])} errors",
        'approaches': [
            {
                'pattern': 'Missing Generic Brackets',
                'count': len(ts1005['patterns']['missing_generic_bracket']),
                'regex_fix': r'Promise<([^<>]+)<([^<>]+)(?!\>)',
                'replacement': r'Promise<\1<\2>>',
                'description': 'Fix incomplete generic type declarations'
            },
            {
                'pattern': 'Missing Function Parentheses',
                'count': len(ts1005['patterns']['missing_parenthesis']),
                'regex_fix': r'\.map\([^)]+\}\s*;',
                'replacement': 'Add closing ) before ;',
                'description': 'Fix incomplete function calls'
            },
            {
                'pattern': 'Missing Semicolons',
                'count': len(ts1005['patterns']['missing_semicolon']),
                'regex_fix': r'(type\s+\w+\s*=\s*[^;]+)(?!\;)$',
                'replacement': r'\1;',
                'description': 'Add missing semicolons to type definitions'
            }
        ]
    }

    # TS1128 Strategies
    ts1128 = categories['TS1128']
    strategies['TS1128'] = {
        'priority': 'MEDIUM',
        'estimated_impact': f"{len(ts1128['errors'])} errors",
        'approaches': [
            {
                'pattern': 'Broken Declarations',
                'count': len(ts1128['patterns']['declaration_expected']),
                'description': 'Repair malformed class/interface declarations',
                'fix_approach': 'Manual structural repair required'
            },
            {
                'pattern': 'Missing Properties',
                'count': len(ts1128['patterns']['property_expected']),
                'description': 'Fix incomplete interface/class properties',
                'fix_approach': 'Add missing property declarations'
            }
        ]
    }

    # TS1434 Strategies
    ts1434 = categories['TS1434']
    strategies['TS1434'] = {
        'priority': 'MEDIUM',
        'estimated_impact': f"{len(ts1434['errors'])} errors",
        'approaches': [
            {
                'pattern': 'Unexpected Keywords',
                'count': len(ts1434['patterns']['unexpected_keyword']),
                'description': 'Fix misplaced or corrupted keywords',
                'fix_approach': 'Context-aware keyword correction'
            }
        ]
    }

    return strategies

def create_comprehensive_report(error_output):
    """Create comprehensive TypeScript error analysis report"""

    print("Parsing TypeScript errors...")
    lines = error_output.split('\n')
    errors = []

    for line in lines:
        if 'error TS' in line:
            parsed = parse_error_line(line)
            if parsed:
                errors.append(parsed)

    print(f"Parsed {len(errors)} TypeScript errors")

    # Categorize errors
    categories = categorize_errors(errors)

    # Analyze file impact
    file_impact = analyze_file_impact(errors)

    # Generate fix strategies
    fix_strategies = generate_fix_strategies(categories)

    # Create comprehensive report
    report = {
        'summary': {
            'total_errors': len(errors),
            'total_files_affected': file_impact['total_files_affected'],
            'error_categories': {code: len(cat['errors']) for code, cat in categories.items()},
            'analysis_timestamp': subprocess.run(['date'], capture_output=True, text=True).stdout.strip()
        },
        'categories': categories,
        'file_impact': file_impact,
        'fix_strategies': fix_strategies,
        'top_priority_files': [
            {
                'file': file,
                'error_count': len(errs),
                'primary_errors': Counter([e['code'] for e in errs]).most_common(3)
            }
            for file, errs in file_impact['most_affected_files'][:10]
        ]
    }

    return report

def save_report(report, filename='typescript-error-analysis-report.json'):
    """Save comprehensive report to JSON file"""

    # Convert defaultdict to regular dict for JSON serialization
    def convert_defaultdict(obj):
        if isinstance(obj, defaultdict):
            return dict(obj)
        elif isinstance(obj, dict):
            return {k: convert_defaultdict(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_defaultdict(item) for item in obj]
        else:
            return obj

    serializable_report = convert_defaultdict(report)

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(serializable_report, f, indent=2, ensure_ascii=False)

    print(f"Report saved to {filename}")

def print_executive_summary(report):
    """Print executive summary of the analysis"""

    print("\n" + "="*80)
    print("TYPESCRIPT ERROR ANALYSIS - EXECUTIVE SUMMARY")
    print("="*80)

    summary = report['summary']
    print(f"Total Errors: {summary['total_errors']:,}")
    print(f"Files Affected: {summary['total_files_affected']:,}")
    print(f"Analysis Date: {summary['analysis_timestamp']}")

    print("\nERROR DISTRIBUTION:")
    for code, count in summary['error_categories'].items():
        if count > 0:
            category_name = report['categories'][code]['name']
            print(f"  {code}: {count:,} errors - {category_name}")

    print("\nTOP PRIORITY FILES FOR FIXING:")
    for i, file_info in enumerate(report['top_priority_files'][:5], 1):
        print(f"  {i}. {file_info['file']} ({file_info['error_count']} errors)")
        for code, count in file_info['primary_errors']:
            print(f"     - {code}: {count} errors")

    print("\nFIX STRATEGY PRIORITIES:")
    for code, strategy in report['fix_strategies'].items():
        print(f"  {code} ({strategy['priority']}): {strategy['estimated_impact']}")
        for approach in strategy['approaches']:
            if 'count' in approach:
                print(f"    - {approach['pattern']}: {approach['count']} instances")

def main():
    """Main analysis function"""
    print("Starting comprehensive TypeScript error analysis...")

    # Get TypeScript errors
    error_output = run_tsc_analysis()

    if not error_output:
        print("No TypeScript errors found or failed to run analysis")
        return

    # Create comprehensive report
    report = create_comprehensive_report(error_output)

    # Save detailed report
    save_report(report)

    # Print executive summary
    print_executive_summary(report)

    print(f"\nComprehensive analysis complete!")
    print(f"Detailed report saved to: typescript-error-analysis-report.json")

if __name__ == "__main__":
    main()