#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: ACE Execution DAG Logger
Logs tool runs for training data and replay capability
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import psycopg2
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import uuid

class ACEExecutionLogger:
    """Log ACE tool executions to ace_runs table"""

    def __init__(self):
        self.conn = psycopg2.connect(
            dbname="legal",
            user="user",
            password="pass",
            host="localhost",
            port="5434"
        )

    def log_run(
        self,
        batch_name: str,
        files_changed: int = 0,
        edits: int = 0,
        errors_before: Optional[int] = None,
        errors_after: Optional[int] = None,
        top_causes: List[str] = None,
        next_actions: List[str] = None,
        exec_time_ms: float = 0,
        llm_summary: str = ""
    ) -> str:
        """
        Log an ACE run to the database

        Returns:
            run_id: Unique identifier for this run
        """
        run_id = f"{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}_{batch_name}"

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO ace_runs (
                run_id, batch_name, files_changed, edits,
                check_errors_before, check_errors_after,
                top_causes, next_actions, execution_time_ms, llm_summary
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            run_id,
            batch_name,
            files_changed,
            edits,
            errors_before,
            errors_after,
            json.dumps(top_causes or []),
            json.dumps(next_actions or []),
            exec_time_ms,
            llm_summary
        ))

        db_id = cursor.fetchone()[0]
        self.conn.commit()
        cursor.close()

        print(f"[OK] Logged run: {run_id} (DB ID: {db_id})")
        return run_id

    def query_recent_runs(self, limit: int = 10) -> List[Dict]:
        """Get recent ACE runs"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                run_id,
                batch_name,
                files_changed,
                edits,
                check_errors_before,
                check_errors_after,
                (check_errors_before - check_errors_after) AS errors_fixed,
                CASE
                    WHEN check_errors_before > 0 THEN
                        ROUND(((check_errors_before - check_errors_after)::FLOAT / check_errors_before * 100)::numeric, 2)
                    ELSE 0
                END AS improvement_pct,
                execution_time_ms,
                created_at
            FROM ace_runs
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))

        columns = [desc[0] for desc in cursor.description]
        runs = []
        for row in cursor.fetchall():
            runs.append(dict(zip(columns, row)))

        cursor.close()
        return runs

    def query_by_batch(self, batch_name: str) -> List[Dict]:
        """Get all runs for a specific batch type"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                run_id,
                files_changed,
                edits,
                check_errors_before,
                check_errors_after,
                top_causes,
                next_actions,
                created_at
            FROM ace_runs
            WHERE batch_name = %s
            ORDER BY created_at DESC
        """, (batch_name,))

        columns = [desc[0] for desc in cursor.description]
        runs = []
        for row in cursor.fetchall():
            run_dict = dict(zip(columns, row))
            # JSONB fields are already parsed by psycopg2
            # Just ensure they're lists
            if not isinstance(run_dict.get('top_causes'), list):
                run_dict['top_causes'] = []
            if not isinstance(run_dict.get('next_actions'), list):
                run_dict['next_actions'] = []
            runs.append(run_dict)

        cursor.close()
        return runs

    def get_improvement_trend(self) -> Dict:
        """Calculate improvement trend over time"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                COUNT(*) as total_runs,
                SUM(files_changed) as total_files_changed,
                SUM(edits) as total_edits,
                SUM(check_errors_before - check_errors_after) as total_errors_fixed,
                AVG(execution_time_ms) as avg_exec_time
            FROM ace_runs
            WHERE check_errors_before IS NOT NULL
              AND check_errors_after IS NOT NULL
        """)

        row = cursor.fetchone()
        cursor.close()

        return {
            'total_runs': row[0] or 0,
            'total_files_changed': row[1] or 0,
            'total_edits': row[2] or 0,
            'total_errors_fixed': row[3] or 0,
            'avg_exec_time_ms': float(row[4]) if row[4] else 0,
        }

    def close(self):
        self.conn.close()


def demo_usage():
    """Demonstrate ACE execution logging"""
    logger = ACEExecutionLogger()

    print("=" * 70)
    print("ACE Execution DAG Logger Demo")
    print("=" * 70)
    print()

    # Log a sample run
    print("1. Logging sample ACE run...")
    run_id = logger.log_run(
        batch_name="set_corruption",
        files_changed=29,
        edits=94,
        errors_before=31999,
        errors_after=28710,
        top_causes=[".set arg separator colon corruption", "object literal comma loss"],
        next_actions=["Run array corruption batch", "Validate with npm run check"],
        exec_time_ms=1234.56,
        llm_summary="Fixed .set() corruption in 29 files. Error count reduced by 10.3%."
    )
    print()

    # Query recent runs
    print("2. Recent runs:")
    runs = logger.query_recent_runs(5)
    for run in runs:
        print(f"   {run['run_id']}")
        print(f"      Batch: {run['batch_name']}")
        print(f"      Files: {run['files_changed']}, Edits: {run['edits']}")
        if run['errors_fixed'] is not None:
            print(f"      Errors fixed: {run['errors_fixed']} ({run['improvement_pct']}%)")
        print()

    # Get improvement trend
    print("3. Overall improvement trend:")
    trend = logger.get_improvement_trend()
    for key, value in trend.items():
        print(f"   {key}: {value}")
    print()

    # Query by batch type
    print("4. Query 'set_corruption' batch runs:")
    batch_runs = logger.query_by_batch("set_corruption")
    for run in batch_runs:
        print(f"   {run['run_id']}: {run['files_changed']} files, {run['edits']} edits")

    logger.close()
    print("\n[OK] Demo complete!")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo_usage()
    else:
        print("Usage: python phase89-execution-logger.py --demo")
        print()
        print("Or import and use programmatically:")
        print("  from phase89_execution_logger import ACEExecutionLogger")
        print("  logger = ACEExecutionLogger()")
        print("  logger.log_run('batch_name', files_changed=10, ...)")
