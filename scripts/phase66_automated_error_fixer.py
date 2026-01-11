
#!/usr/bin/env python3
"""
Phase 66: Automated CSS/TypeScript Error Fixer
Uses CrewAI + Ollama (Native) + Langfuse to automatically fix svelte-check errors.

NOTE: This script strictly uses local Ollama models.
If you encounter pip dependency conflicts with 'openai' or 'langchain-openai',
please run: `pip install crewai --no-deps` or upgrade openai.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# CrewAI imports
from crewai import Agent, Crew, Task, LLM
from crewai.tools import tool

# Environment setup
WORKSPACE_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = WORKSPACE_ROOT / "sveltekit-frontend"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")
LANGFUSE_URL = os.getenv("LANGFUSE_URL", "http://localhost:3030")

# Force OpenAI API Key to dummy value to prevent implicit lookups
os.environ["OPENAI_API_KEY"] = "NA"

# Configure LLM for Native Ollama Support
llm_config = LLM(
    model=f"ollama/{OLLAMA_MODEL}",
    base_url="http://localhost:11434",
    temperature=0.1,  # Low temperature for deterministic fixes
    timeout=120,      # Longer timeout for analysis
)

print("🤖 Phase 66: Automated Error Fixer (Ollama Native)")
print("=" * 60)
print(f"📁 Workspace: {WORKSPACE_ROOT}")
print(f"🧠 LLM: {OLLAMA_MODEL}")
print(f"📊 Langfuse: {LANGFUSE_URL}")
print("=" * 60)


# ============================================================================
# Tools for AI Agents
# ============================================================================

@tool("Run svelte-check and get error patterns")
def get_error_patterns() -> str:
    """
    Runs svelte-check and extracts the most common error patterns.
    Returns a JSON string with error categories and examples.
    """
    print("\n🔍 Running svelte-check to analyze errors...")

    try:
        # Use PowerShell to run npx with proper PATH context
        ps_cmd = f'cd "{FRONTEND_DIR}"; npx svelte-check --threshold error'
        result = subprocess.run(
            ["powershell", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=300,
            shell=True
        )

        output = result.stdout + result.stderr

        patterns = {
            "css_parsing_errors": [],
            "typescript_errors": [],
            "total_errors": 0,
            "summary": "No errors found"
        }

        # Find CSS parsing errors
        css_errors = re.findall(r'\[vite:css\]\[postcss\] Failed to parse.*?with message: "(.*?)"', output, re.DOTALL)
        patterns["css_parsing_errors"] = list(set(css_errors))[:10]

        # Find TypeScript errors
        ts_errors = re.findall(r'Error\(TS\d+\): (.+?)(?:\n|$)', output)
        patterns["typescript_errors"] = list(set(ts_errors))[:10]

        # Extract error count
        error_match = re.search(r'found (\d+) errors', output)
        if error_match:
            error_count = int(error_match.group(1))
            patterns["total_errors"] = error_count
            patterns["summary"] = f"Found {error_count} errors"

        return json.dumps(patterns, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@tool("Search for pattern in codebase")
def search_pattern(pattern: str, file_extensions: str = "*.svelte,*.ts") -> str:
    """
    Searches for a specific regex pattern in the codebase.
    Returns files where the pattern is found.

    Args:
        pattern: The regex pattern to search for
        file_extensions: Comma-separated extensions (e.g. "*.svelte,*.ts")
    """
    print(f"\n🔎 Searching for: {pattern}")

    try:
        # Use PowerShell Select-String or Get-ChildItem
        ps_cmd = f'''
        cd "{FRONTEND_DIR}"
        Get-ChildItem -Path src -Include {file_extensions} -Recurse |
            Where-Object {{ (Get-Content $_.FullName -Raw) -match '{pattern}' }} |
            Select-Object -ExpandProperty Name
        '''
        result = subprocess.run(
            ["powershell", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=45,
            shell=True
        )

        files = result.stdout.strip().split('\n') if result.stdout else []
        files = [f.strip() for f in files if f.strip()]

        return json.dumps({
            "pattern": pattern,
            "files_found": len(files),
            "files": files[:20],  # Limit sample
        }, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@tool("Run specialized Node.js fixer")
def run_specialized_fixer(fixer_name: str) -> str:
    """
    Runs a specialized high-performance Node.js fix script.
    Use this for widespread structural corruption patterns.

    Available fixers:
    - 'fix-type-imports': Fixes 'import type { A: B }' corruption
    - 'fix-formdata-corruption': Fixes 'formData.get()' argument corruption

    Args:
        fixer_name: The name of the fixer to run
    """
    print(f"\n🔧 Running specialized fixer: {fixer_name}")

    scripts = {
        'fix-type-imports': 'scripts/fix-type-imports.mjs',
        'fix-formdata-corruption': 'scripts/fix-formdata-corruption.mjs'
    }

    if fixer_name not in scripts:
        return json.dumps({"error": f"Unknown fixer: {fixer_name}. Available: {list(scripts.keys())}"})

    script_path = scripts[fixer_name]

    try:
        # Run node script
        cmd = f'cd "{FRONTEND_DIR}"; node {script_path}'
        result = subprocess.run(
            ["powershell", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=120,
            shell=True
        )

        return json.dumps({
            "fixer": fixer_name,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "success": result.returncode == 0
        }, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@tool("Apply regex replacement")
def apply_regex_fix(pattern: str, replacement: str, description: str) -> str:
    """
    Applies a bulk regex find-replace operation across the codebase.
    Use this for simple text substitutions.
    """
    print(f"\n🔧 Applying Regex Fix: {description}")

    try:
        # PowerShell bulk replace
        # Note: PowerShell escaping for regex can be tricky.
        ps_command = f"""
        cd '{FRONTEND_DIR}'
        $files = Get-ChildItem -Path src -Include *.svelte,*.ts,*.js -Recurse | Where-Object {{ (Get-Content $_.FullName -Raw) -match '{pattern}' }}
        $count = 0
        foreach ($file in $files) {{
            $content = Get-Content $file.FullName -Raw
            $newContent = $content -replace '{pattern}', '{replacement}'
            if ($content -ne $newContent) {{
                Set-Content $file.FullName $newContent -NoNewline
                $count++
            }}
        }}
        Write-Host "Fixed $count files"
        """

        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_command],
            capture_output=True,
            text=True,
            timeout=60,
            shell=True
        )

        return json.dumps({
            "description": description,
            "result": result.stdout.strip(),
            "success": result.returncode == 0
        }, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@tool("Verify fixes")
def verify_fixes() -> str:
    """Runs svelte-check to get current error count."""
    print("\n✅ Verifying fixes...")
    # Reuse get_error_patterns logic but simplified return
    res = get_error_patterns._run()
    data = json.loads(res)
    return json.dumps({
        "total_errors": data.get("total_errors", "unknown"),
        "summary": data.get("summary")
    })


# ============================================================================
# AI Agents
# ============================================================================

error_analyzer = Agent(
    role="Principal Software Engineer",
    goal="Identify structural code corruption and syntax errors",
    backstory="""You are a senior engineer specializing in TypeScript and Svelte.
    You recognize patterns like 'import type { A: B }' (colon corruption) or
    'formData.get(key, prop:' (argument corruption). You prefer using
    specialized scripts for massive fixes over manual regex.""",
    llm=llm_config,
    tools=[get_error_patterns, search_pattern],
    verbose=True
)

fix_engineer = Agent(
    role="Automation Engineer",
    goal="Apply safe, high-impact fixes using scripts or regex",
    backstory="""You execute fixes. You prioritize running 'run_specialized_fixer'
    if the error pattern matches a known widespread corruption (imports, formData).
    For other errors, you carefully craft regex replacements.""",
    llm=llm_config,
    tools=[run_specialized_fixer, apply_regex_fix, search_pattern],
    verbose=True
)

qa_lead = Agent(
    role="QA Lead",
    goal="Verify error reduction",
    backstory="""You ensure the codebase health improves. You run verification
    after fixing batches.""",
    llm=llm_config,
    tools=[verify_fixes],
    verbose=True
)

# ============================================================================
# Tasks
# ============================================================================

task_analyze = Task(
    description="""
    1. Run verify_fixes to get the current error count.
    2. Run get_error_patterns to see what remains.
    3. If you see 'import type' corruption errors, recommend 'fix-type-imports'.
    4. If you see 'formData' errors, recommend 'fix-formdata-corruption'.
    5. Identify other regex patterns.
    """,
    agent=error_analyzer,
    expected_output="Analysis of top error patterns and recommended fix strategy."
)

task_fix = Task(
    description="""
    Based on the analysis:
    1. If recommended, run 'fix-type-imports' using run_specialized_fixer.
    2. If recommended, run 'fix-formdata-corruption' using run_specialized_fixer.
    3. If there are other simple regex patterns, apply them using apply_regex_fix.
    """,
    agent=fix_engineer,
    expected_output="Report of scripts run and fixes applied.",
    context=[task_analyze]
)

task_verify = Task(
    description="""
    1. Run verify_fixes to measure final error count.
    2. Report the improvement.
    """,
    agent=qa_lead,
    expected_output="Final verification report."
)

# ============================================================================
# Main
# ============================================================================

def main():
    print("🚀 Starting Phase 66 Crew (Ollama Native)")

    crew = Crew(
        agents=[error_analyzer, fix_engineer, qa_lead],
        tasks=[task_analyze, task_fix, task_verify],
        verbose=True
    )

    result = crew.kickoff()
    print("\n🏁 Mission Complete")
    print(result)

if __name__ == "__main__":
    main()
