#!/usr/bin/env python3
"""
Agent Planner - Intelligent "what's next?" planner with timeline analysis
"""
from typing import List, Dict, Any, Optional
import json
import psycopg2
from datetime import datetime, timedelta

class AgentPlanner:
    def __init__(self, db_config: Dict[str, Any]):
        self.db_config = db_config

    def get_next_step(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """
        Analyze session timeline and suggest optimal next action
        """
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            # Get current session state
            cursor.execute("""
                SELECT current_state, timeline, user_id
                FROM chr97_agent.agent_sessions
                WHERE session_id = %s
            """, (session_id,))

            row = cursor.fetchone()
            if not row:
                # Create new session
                return self._create_new_session(session_id, user_message)

            current_state, timeline_json, user_id = row
            timeline = timeline_json or []

            # Analyze timeline patterns
            analysis = self._analyze_timeline(timeline, user_message)

            # Suggest next step based on patterns
            next_step = self._suggest_next_step(analysis, current_state)

            # Update session
            new_timeline = timeline + [{
                'timestamp': datetime.now().isoformat(),
                'user_message': user_message,
                'analysis': analysis,
                'suggested_step': next_step
            }]

            cursor.execute("""
                UPDATE chr97_agent.agent_sessions
                SET current_state = %s, timeline = %s, updated_at = CURRENT_TIMESTAMP
                WHERE session_id = %s
            """, (json.dumps(next_step), json.dumps(new_timeline), session_id))

            conn.commit()

            return next_step

        finally:
            cursor.close()
            conn.close()

    def _create_new_session(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Create new agent session"""
        conn = psycopg2.connect(**self.db_config)
        cursor = conn.cursor()

        try:
            user_id = session_id.split(':')[0] if ':' in session_id else 'unknown'

            initial_state = {
                'phase': 'analysis',
                'confidence': 0.5,
                'next_action': 'analyze_documents',
                'reasoning': 'Starting new legal analysis session'
            }

            timeline = [{
                'timestamp': datetime.now().isoformat(),
                'user_message': user_message,
                'analysis': {'new_session': True},
                'suggested_step': initial_state
            }]

            cursor.execute("""
                INSERT INTO chr97_agent.agent_sessions (session_id, user_id, current_state, timeline)
                VALUES (%s, %s, %s, %s)
            """, (session_id, user_id, json.dumps(initial_state), json.dumps(timeline)))

            conn.commit()

            return initial_state

        finally:
            cursor.close()
            conn.close()

    def _analyze_timeline(self, timeline: List[Dict], current_message: str) -> Dict[str, Any]:
        """Analyze timeline patterns to understand user workflow"""
        if not timeline:
            return {'pattern': 'new_session', 'confidence': 0.5}

        # Simple pattern recognition
        recent_actions = [entry.get('suggested_step', {}).get('next_action') for entry in timeline[-5:]]

        patterns = {
            'document_analysis': recent_actions.count('analyze_documents') / len(recent_actions),
            'citation_research': recent_actions.count('research_citations') / len(recent_actions),
            'pattern_matching': recent_actions.count('find_similar_cases') / len(recent_actions),
            'timeline_analysis': recent_actions.count('analyze_timeline') / len(recent_actions)
        }

        dominant_pattern = max(patterns, key=patterns.get)

        return {
            'dominant_pattern': dominant_pattern,
            'pattern_confidence': patterns[dominant_pattern],
            'timeline_length': len(timeline),
            'recent_focus': recent_actions[-3:] if recent_actions else []
        }

    def _suggest_next_step(self, analysis: Dict[str, Any], current_state: Dict[str, Any]) -> Dict[str, Any]:
        """Suggest optimal next step based on analysis"""

        phase = current_state.get('phase', 'analysis')
        confidence = current_state.get('confidence', 0.5)

        # Phase progression logic
        if phase == 'analysis' and confidence > 0.7:
            return {
                'phase': 'research',
                'next_action': 'research_citations',
                'confidence': confidence,
                'reasoning': 'Analysis complete, moving to citation research'
            }
        elif phase == 'research' and analysis.get('dominant_pattern') == 'citation_research':
            return {
                'phase': 'pattern_matching',
                'next_action': 'find_similar_cases',
                'confidence': min(confidence + 0.1, 0.9),
                'reasoning': 'Citation research active, suggest pattern matching'
            }
        elif phase == 'pattern_matching':
            return {
                'phase': 'synthesis',
                'next_action': 'generate_summary',
                'confidence': min(confidence + 0.1, 0.95),
                'reasoning': 'Pattern matching complete, ready for synthesis'
            }
        else:
            # Default analysis phase
            return {
                'phase': 'analysis',
                'next_action': 'analyze_documents',
                'confidence': max(confidence - 0.05, 0.3),
                'reasoning': 'Continue document analysis'
            }