"""
Week 3 Tasks 2-4: Enhanced KB Fixing API
=========================================

Task 2: Auto-Approval Engine
Task 3: PostgreSQL Migration & Provenance Tracking
Task 4: Agentic Fix Generator

New endpoints:
    # Auto-Approval (Task 2)
    GET /api/kb/approval-rules - List auto-approval rules
    POST /api/kb/approval-rules - Create new rule
    DELETE /api/kb/approval-rules/{rule_id} - Delete rule

    # Provenance (Task 3)
    GET /api/kb/provenance/{fix_id} - Get full provenance for a fix
    GET /api/kb/provenance/file/{file_path} - All fixes for a file
    GET /api/kb/provenance/source/{source_id} - All fixes using a source

    # Agentic (Task 4)
    POST /api/kb/agentic-fix - Autonomous fix generation with multi-step reasoning
    GET /api/kb/agentic-status/{task_id} - Get status of agentic fix task
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import httpx
import json
import asyncio
import re

router = APIRouter(prefix="/api/kb/v2", tags=["knowledge-based-fixing-v2"])
logger = logging.getLogger(__name__)

# ============================================================================
# Database Models (Task 3: PostgreSQL Integration)
# ============================================================================

# TODO: Import from Drizzle schema when integrated
# from lib.server.db.schema_week3_kb import (
#     autoApprovalRules, kbProvenanceGraph, errorSessions, generatedFixes
# )

# Temporary in-memory storage (will be replaced by PostgreSQL)
db_auto_approval_rules: List[Dict] = []
db_error_sessions: Dict[str, Dict] = {}
db_generated_fixes: Dict[str, Dict] = {}
db_provenance_graph: List[Dict] = []

# ============================================================================
# Pydantic Models
# ============================================================================

class AutoApprovalRule(BaseModel):
    """Auto-approval rule for trusted sources"""
    rule_id: Optional[int] = None
    source_pattern: str  # Regex or glob pattern
    source_type: str  # 'qdrant', 'couchdb', 'github'
    min_relevance_score: float = 0.8
    auto_approve: bool = True
    description: Optional[str] = None
    created_by: str = "system"
    is_active: bool = True


class AgenticFixRequest(BaseModel):
    """Request for autonomous agentic fix generation"""
    file_path: str
    error_message: str
    error_type: str
    max_iterations: int = 3
    auto_apply: bool = False  # If true, apply fix without human approval
    confidence_threshold: float = 0.85  # Only apply if confidence >= threshold


class AgenticFixStatus(BaseModel):
    """Status of agentic fix task"""
    task_id: str
    status: str  # 'searching', 'validating', 'generating', 'testing', 'completed', 'failed'
    current_iteration: int
    max_iterations: int
    sources_found: int
    fixes_generated: int
    confidence_score: Optional[float] = None
    error_message: Optional[str] = None
    started_at: str
    updated_at: str


# ============================================================================
# Helper Functions: Auto-Approval (Task 2)
# ============================================================================

async def check_auto_approval(source: Dict, source_type: str) -> bool:
    """Check if source matches auto-approval rules"""
    # Query active rules for this source type
    active_rules = [
        rule for rule in db_auto_approval_rules
        if rule['source_type'] == source_type and rule['is_active']
    ]

    for rule in active_rules:
        pattern = rule['source_pattern']
        min_score = rule['min_relevance_score']

        # Check if source matches pattern
        source_id = source.get('source_id', '')
        if re.match(pattern, source_id) or source_id.startswith(pattern.replace('%', '')):
            # Check relevance score
            if source.get('relevance_score', 0) >= min_score:
                logger.info(f"✅ Auto-approved: {source_id} (rule: {pattern})")
                return True

    return False


async def auto_validate_sources(sources: List[Dict]) -> tuple[List[str], List[str]]:
    """Automatically validate sources based on approval rules"""
    validated = []
    pending = []

    for source in sources:
        source_type = source.get('source_type', 'unknown')

        if await check_auto_approval(source, source_type):
            validated.append(source['source_id'])
        else:
            pending.append(source['source_id'])

    return validated, pending


# ============================================================================
# Helper Functions: Agentic Fix Generation (Task 4)
# ============================================================================

class AgenticFixAgent:
    """Multi-step reasoning agent for autonomous fix generation"""

    def __init__(self, request: AgenticFixRequest):
        self.request = request
        self.task_id = f"agentic_{datetime.utcnow().strftime('%Y%m%d_%H%M%S%f')}"
        self.status = AgenticFixStatus(
            task_id=self.task_id,
            status='searching',
            current_iteration=0,
            max_iterations=request.max_iterations,
            sources_found=0,
            fixes_generated=0,
            started_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        self.sources = []
        self.validated_sources = []
        self.generated_fixes = []

    async def run(self) -> Dict:
        """Execute multi-step agentic workflow"""
        try:
            # Step 1: Search for sources
            await self.search_sources()

            # Step 2: Auto-validate sources
            await self.validate_sources()

            # Step 3: Generate fixes (with iterations)
            for iteration in range(self.request.max_iterations):
                self.status.current_iteration = iteration + 1
                self.status.status = 'generating'

                fix = await self.generate_fix()

                # Step 4: Test fix (syntax check)
                if await self.test_fix(fix):
                    self.generated_fixes.append(fix)

                    # If confidence high enough, we're done
                    if fix['confidence_score'] >= self.request.confidence_threshold:
                        break

            # Step 5: Select best fix
            best_fix = self.select_best_fix()

            # Step 6: Apply if auto_apply enabled
            if self.request.auto_apply and best_fix:
                await self.apply_fix(best_fix)

            self.status.status = 'completed'
            self.status.confidence_score = best_fix.get('confidence_score', 0) if best_fix else 0.0

            return {
                'task_id': self.task_id,
                'status': 'completed',
                'best_fix': best_fix,
                'all_fixes': self.generated_fixes,
                'sources_used': self.validated_sources
            }

        except Exception as e:
            self.status.status = 'failed'
            self.status.error_message = str(e)
            logger.error(f"❌ Agentic fix failed: {e}")
            return {
                'task_id': self.task_id,
                'status': 'failed',
                'error': str(e)
            }
        finally:
            self.status.updated_at = datetime.utcnow().isoformat()

    async def search_sources(self):
        """Step 1: Search knowledge bases"""
        self.status.status = 'searching'

        # Search Qdrant
        qdrant_results = await self.search_qdrant()

        # Search CouchDB
        couchdb_results = await self.search_couchdb()

        self.sources = qdrant_results + couchdb_results
        self.status.sources_found = len(self.sources)
        logger.info(f"🔍 Found {len(self.sources)} sources")

    async def search_qdrant(self) -> List[Dict]:
        """Search Qdrant vector database"""
        try:
            query = f"{self.request.error_type}: {self.request.error_message}"

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:6333/collections/phase92_knowledge_base/points/search",
                    json={
                        "vector": [0.1] * 384,  # TODO: Use actual embeddings
                        "limit": 5,
                        "with_payload": True
                    },
                    timeout=10
                )

                if response.status_code == 200:
                    results = response.json().get('result', [])
                    return [{
                        'source_id': f"qdrant_{r['id']}",
                        'source_type': 'qdrant',
                        'title': r['payload'].get('title', 'Unknown'),
                        'content': r['payload'].get('content', ''),
                        'relevance_score': r.get('score', 0.5)
                    } for r in results]
        except Exception as e:
            logger.warning(f"⚠️ Qdrant search failed: {e}")

        return []

    async def search_couchdb(self) -> List[Dict]:
        """Search CouchDB summaries"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "http://localhost:5984/llm_summaries/_all_docs",
                    params={'include_docs': 'true', 'limit': 3},
                    timeout=10
                )

                if response.status_code == 200:
                    rows = response.json().get('rows', [])
                    return [{
                        'source_id': f"couchdb_{row['id']}",
                        'source_type': 'couchdb',
                        'title': row['doc'].get('file_path', 'Unknown'),
                        'content': row['doc'].get('summary', ''),
                        'relevance_score': 0.7
                    } for row in rows if 'doc' in row]
        except Exception as e:
            logger.warning(f"⚠️ CouchDB search failed: {e}")

        return []

    async def validate_sources(self):
        """Step 2: Auto-validate sources"""
        self.status.status = 'validating'

        validated, pending = await auto_validate_sources(self.sources)

        # For agentic mode, use confidence-based validation
        for source in self.sources:
            if source['source_id'] in validated:
                self.validated_sources.append(source)
            elif source['relevance_score'] >= 0.75:
                # High relevance = auto-validate even without rule
                self.validated_sources.append(source)
                logger.info(f"✅ Auto-validated high-relevance source: {source['source_id']}")

        logger.info(f"✅ Validated {len(self.validated_sources)} sources")

    async def generate_fix(self) -> Dict:
        """Step 3: Generate fix using LLM"""
        self.status.status = 'generating'

        # Build context from validated sources
        context = "\n\n".join([
            f"Source {i+1}: {s['title']}\n{s['content'][:500]}"
            for i, s in enumerate(self.validated_sources)
        ])

        prompt = f"""Fix the following error using the provided knowledge sources:

ERROR TYPE: {self.request.error_type}
ERROR MESSAGE: {self.request.error_message}
FILE: {self.request.file_path}

KNOWLEDGE SOURCES:
{context}

Generate a fix in the following format:
FIXED_CODE:
<your fixed code here>

EXPLANATION:
<explanation of the fix>

SOURCE CITATIONS:
<which sources you used>
"""

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": "gemma3-legal:latest",
                        "prompt": prompt,
                        "stream": False
                    },
                    timeout=60
                )

                if response.status_code == 200:
                    result = response.json()
                    text = result.get('response', '')

                    # Parse response
                    fixed_code = self.extract_section(text, 'FIXED_CODE')
                    explanation = self.extract_section(text, 'EXPLANATION')

                    fix = {
                        'fix_id': f"fix_{datetime.utcnow().strftime('%Y%m%d_%H%M%S%f')}",
                        'fixed_code': fixed_code,
                        'explanation': explanation,
                        'source_citations': [s['source_id'] for s in self.validated_sources],
                        'confidence_score': 0.80,  # TODO: Calculate based on source quality
                        'iteration': self.status.current_iteration
                    }

                    self.status.fixes_generated += 1
                    return fix
        except Exception as e:
            logger.error(f"❌ Fix generation failed: {e}")
            raise

    async def test_fix(self, fix: Dict) -> bool:
        """Step 4: Test fix for syntax errors"""
        self.status.status = 'testing'

        # TODO: Implement actual syntax checking
        # For now, simple heuristic: check if code is non-empty
        fixed_code = fix.get('fixed_code', '')

        if len(fixed_code) < 10:
            logger.warning("⚠️ Fix too short, likely invalid")
            return False

        # Check for common error patterns
        error_patterns = ['error', 'undefined', 'null']
        if any(pattern in fixed_code.lower() for pattern in error_patterns):
            logger.warning("⚠️ Fix contains error keywords")
            fix['confidence_score'] *= 0.8

        return True

    def select_best_fix(self) -> Optional[Dict]:
        """Step 5: Select fix with highest confidence"""
        if not self.generated_fixes:
            return None

        return max(self.generated_fixes, key=lambda f: f['confidence_score'])

    async def apply_fix(self, fix: Dict):
        """Step 6: Apply fix to file"""
        # TODO: Implement file writing
        # For now, just log
        logger.info(f"✅ Auto-applied fix: {fix['fix_id']}")

        # Track in provenance
        provenance = {
            'fix_id': fix['fix_id'],
            'file_path': self.request.file_path,
            'applied_at': datetime.utcnow().isoformat(),
            'applied_by': 'agentic_system',
            'validated_sources': fix['source_citations'],
            'fix_content': fix['fixed_code'],
            'success': True,
            'auto_applied': True
        }
        db_provenance_graph.append(provenance)

    @staticmethod
    def extract_section(text: str, section_name: str) -> str:
        """Extract section from LLM response"""
        pattern = f"{section_name}:\\s*(.+?)(?=\\n\\n[A-Z]+:|$)"
        match = re.search(pattern, text, re.DOTALL)
        return match.group(1).strip() if match else ""


# In-memory task storage (replace with Redis/PostgreSQL)
agentic_tasks: Dict[str, AgenticFixAgent] = {}


# ============================================================================
# API Endpoints: Auto-Approval Rules (Task 2)
# ============================================================================

@router.get("/approval-rules", response_model=List[AutoApprovalRule])
async def list_approval_rules(
    source_type: Optional[str] = None,
    active_only: bool = True
):
    """List auto-approval rules"""
    rules = db_auto_approval_rules

    if source_type:
        rules = [r for r in rules if r['source_type'] == source_type]

    if active_only:
        rules = [r for r in rules if r['is_active']]

    return rules


@router.post("/approval-rules", response_model=AutoApprovalRule)
async def create_approval_rule(rule: AutoApprovalRule):
    """Create new auto-approval rule"""
    rule_dict = rule.model_dump()
    rule_dict['rule_id'] = len(db_auto_approval_rules) + 1
    rule_dict['created_at'] = datetime.utcnow().isoformat()

    db_auto_approval_rules.append(rule_dict)

    logger.info(f"✅ Created approval rule: {rule_dict['source_pattern']}")
    return rule_dict


@router.delete("/approval-rules/{rule_id}")
async def delete_approval_rule(rule_id: int):
    """Delete auto-approval rule"""
    global db_auto_approval_rules

    original_len = len(db_auto_approval_rules)
    db_auto_approval_rules = [r for r in db_auto_approval_rules if r['rule_id'] != rule_id]

    if len(db_auto_approval_rules) < original_len:
        return {"message": f"Deleted rule {rule_id}"}
    else:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")


# ============================================================================
# API Endpoints: Provenance Tracking (Task 3)
# ============================================================================

@router.get("/provenance/{fix_id}")
async def get_fix_provenance(fix_id: str):
    """Get full provenance for a specific fix"""
    provenance = next((p for p in db_provenance_graph if p['fix_id'] == fix_id), None)

    if not provenance:
        raise HTTPException(status_code=404, detail=f"Fix {fix_id} not found")

    return provenance


@router.get("/provenance/file/{file_path:path}")
async def get_file_provenance(file_path: str):
    """Get all fixes applied to a file"""
    fixes = [p for p in db_provenance_graph if p['file_path'] == file_path]

    # Sort by most recent first
    fixes.sort(key=lambda p: p['applied_at'], reverse=True)

    return {
        'file_path': file_path,
        'total_fixes': len(fixes),
        'fixes': fixes
    }


@router.get("/provenance/source/{source_id}")
async def get_source_provenance(source_id: str):
    """Get all fixes that used a specific source"""
    fixes = [
        p for p in db_provenance_graph
        if source_id in p.get('validated_sources', [])
    ]

    return {
        'source_id': source_id,
        'times_used': len(fixes),
        'fixes': fixes
    }


# ============================================================================
# API Endpoints: Agentic Fix Generation (Task 4)
# ============================================================================

@router.post("/agentic-fix")
async def start_agentic_fix(
    request: AgenticFixRequest,
    background_tasks: BackgroundTasks
):
    """Start autonomous agentic fix generation"""
    agent = AgenticFixAgent(request)
    agentic_tasks[agent.task_id] = agent

    # Run in background
    background_tasks.add_task(agent.run)

    return {
        'task_id': agent.task_id,
        'status': 'started',
        'message': 'Agentic fix generation started',
        'check_status_url': f"/api/kb/v2/agentic-status/{agent.task_id}"
    }


@router.get("/agentic-status/{task_id}", response_model=AgenticFixStatus)
async def get_agentic_status(task_id: str):
    """Get status of agentic fix task"""
    agent = agentic_tasks.get(task_id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    return agent.status


# ============================================================================
# Initialization: Seed auto-approval rules
# ============================================================================

def init_auto_approval_rules():
    """Initialize default auto-approval rules"""
    default_rules = [
        {
            'rule_id': 1,
            'source_pattern': 'svelte.dev/docs.*',
            'source_type': 'couchdb',
            'min_relevance_score': 0.85,
            'description': 'Official Svelte documentation',
            'created_by': 'system',
            'is_active': True
        },
        {
            'rule_id': 2,
            'source_pattern': 'github.com/sveltejs/svelte.*',
            'source_type': 'qdrant',
            'min_relevance_score': 0.90,
            'description': 'Official Svelte GitHub repository',
            'created_by': 'system',
            'is_active': True
        },
        {
            'rule_id': 3,
            'source_pattern': 'typescript.org/docs.*',
            'source_type': 'couchdb',
            'min_relevance_score': 0.85,
            'description': 'Official TypeScript documentation',
            'created_by': 'system',
            'is_active': True
        },
        {
            'rule_id': 4,
            'source_pattern': 'phase92_knowledge_base:validated.*',
            'source_type': 'qdrant',
            'min_relevance_score': 0.80,
            'description': 'Pre-validated Phase 92 knowledge base',
            'created_by': 'system',
            'is_active': True
        }
    ]

    db_auto_approval_rules.extend(default_rules)
    logger.info(f"✅ Initialized {len(default_rules)} auto-approval rules")


# Initialize on module load
init_auto_approval_rules()
