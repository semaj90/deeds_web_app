#!/usr/bin/env python3
"""
Multi-Agent Coordination System
Multiple AI agents working together to solve complex legal tasks
"""

import asyncio
import threading
import queue
import time
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
import logging
import json
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)

@dataclass
class AgentMessage:
    """Message between agents"""
    sender_id: str
    receiver_id: str
    message_type: str
    content: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    priority: int = 1  # 1=low, 5=high

@dataclass
class TaskAllocation:
    """Task allocation to agents"""
    task_id: str
    agent_id: str
    subtask: Dict[str, Any]
    priority: int
    deadline: Optional[float] = None

@dataclass
class CoordinationResult:
    """Result from agent coordination"""
    task_id: str
    results: Dict[str, Any]
    consensus_score: float
    execution_time: float
    agent_contributions: Dict[str, float]

class AgentCoordinator:
    """Coordinates multiple AI agents for complex tasks"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.agents: Dict[str, 'LegalAIAgent'] = {}
        self.message_queue = queue.PriorityQueue()
        self.task_queue = queue.Queue()
        self.result_queue = queue.Queue()

        self.max_concurrent_tasks = self.config.get('max_concurrent_tasks', 5)
        self.active_tasks: Dict[str, Dict[str, Any]] = {}
        self.task_counter = 0

        # Coordination threads
        self.coordination_thread = None
        self.message_thread = None
        self.running = False

        # Coordination strategies
        self.strategies = {
            'round_robin': self._round_robin_allocation,
            'capability_based': self._capability_based_allocation,
            'load_balanced': self._load_balanced_allocation,
            'consensus_driven': self._consensus_driven_allocation
        }

        logger.info("Agent coordinator initialized")

    async def initialize(self):
        """Initialize the agent coordinator"""
        # Already initialized in constructor
        pass

    def register_agent(self, agent: 'LegalAIAgent'):
        """Register an agent with the coordinator"""
        self.agents[agent.agent_id] = agent
        logger.info(f"Agent registered: {agent.agent_id}")

    def unregister_agent(self, agent_id: str):
        """Unregister an agent"""
        if agent_id in self.agents:
            del self.agents[agent_id]
            logger.info(f"Agent unregistered: {agent_id}")

    def start(self):
        """Start the coordination system"""
        if self.running:
            return

        self.running = True

        # Start coordination threads
        self.coordination_thread = threading.Thread(target=self._coordination_loop)
        self.message_thread = threading.Thread(target=self._message_processing_loop)

        self.coordination_thread.start()
        self.message_thread.start()

        logger.info("Agent coordination system started")

    def stop(self):
        """Stop the coordination system"""
        self.running = False

        if self.coordination_thread:
            self.coordination_thread.join()
        if self.message_thread:
            self.message_thread.join()

        logger.info("Agent coordination system stopped")

    def submit_task(self, task: Dict[str, Any], strategy: str = 'capability_based') -> str:
        """Submit a task for agent coordination"""
        task_id = f"task_{self.task_counter}"
        self.task_counter += 1

        task_data = {
            'task_id': task_id,
            'task': task,
            'strategy': strategy,
            'submitted_at': time.time(),
            'status': 'queued'
        }

        self.task_queue.put(task_data)
        logger.info(f"Task submitted: {task_id}")
        return task_id

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a task"""
        return self.active_tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id]['status'] = 'cancelled'
            return True
        return False

    def send_message(self, message: AgentMessage):
        """Send message between agents"""
        self.message_queue.put((-message.priority, message))  # Negative for max-heap behavior

    def _coordination_loop(self):
        """Main coordination loop"""
        while self.running:
            try:
                # Process queued tasks
                if not self.task_queue.empty() and len(self.active_tasks) < self.max_concurrent_tasks:
                    task_data = self.task_queue.get_nowait()
                    asyncio.run(self._process_task(task_data))

                # Check for completed tasks
                self._check_completed_tasks()

                time.sleep(0.1)  # Small delay to prevent busy waiting

            except Exception as e:
                logger.error(f"Error in coordination loop: {e}")

    def _message_processing_loop(self):
        """Process inter-agent messages"""
        while self.running:
            try:
                if not self.message_queue.empty():
                    _, message = self.message_queue.get_nowait()
                    self._handle_message(message)

                time.sleep(0.05)

            except Exception as e:
                logger.error(f"Error in message processing: {e}")

    async def _process_task(self, task_data: Dict[str, Any]):
        """Process a submitted task"""
        task_id = task_data['task_id']
        task = task_data['task']
        strategy = task_data['strategy']

        logger.info(f"Processing task {task_id} with strategy {strategy}")

        # Mark as active
        self.active_tasks[task_id] = task_data
        task_data['status'] = 'processing'
        task_data['started_at'] = time.time()

        try:
            # Allocate task to agents
            allocations = await self._allocate_task(task, strategy)

            if not allocations:
                task_data['status'] = 'failed'
                task_data['error'] = 'No suitable agents available'
                return

            # Execute allocations
            results = await self._execute_allocations(allocations, task_id)

            # Coordinate results
            final_result = await self._coordinate_results(results, task)

            # Store result
            task_data['status'] = 'completed'
            task_data['result'] = final_result
            task_data['completed_at'] = time.time()

            logger.info(f"Task {task_id} completed successfully")

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            task_data['status'] = 'failed'
            task_data['error'] = str(e)

    async def _allocate_task(self, task: Dict[str, Any], strategy: str) -> List[TaskAllocation]:
        """Allocate task to agents using specified strategy"""
        if strategy not in self.strategies:
            strategy = 'capability_based'

        allocation_func = self.strategies[strategy]
        return await allocation_func(task)

    async def _round_robin_allocation(self, task: Dict[str, Any]) -> List[TaskAllocation]:
        """Simple round-robin allocation"""
        allocations = []
        agent_ids = list(self.agents.keys())

        if not agent_ids:
            return allocations

        # Simple round-robin - could be improved with agent state tracking
        primary_agent = agent_ids[self.task_counter % len(agent_ids)]

        allocations.append(TaskAllocation(
            task_id=f"task_{self.task_counter}",
            agent_id=primary_agent,
            subtask=task,
            priority=3
        ))

        return allocations

    async def _capability_based_allocation(self, task: Dict[str, Any]) -> List[TaskAllocation]:
        """Allocate based on agent capabilities"""
        allocations = []
        required_capabilities = task.get('required_capabilities', [])

        suitable_agents = []
        for agent_id, agent in self.agents.items():
            if any(cap in agent.capabilities for cap in required_capabilities):
                suitable_agents.append(agent_id)

        if not suitable_agents:
            # Fallback to all agents if no specific capabilities match
            suitable_agents = list(self.agents.keys())

        # Allocate to top matching agents (up to 3)
        for i, agent_id in enumerate(suitable_agents[:3]):
            allocations.append(TaskAllocation(
                task_id=f"task_{self.task_counter}",
                agent_id=agent_id,
                subtask=self._create_subtask(task, agent_id, i),
                priority=3
            ))

        return allocations

    async def _load_balanced_allocation(self, task: Dict[str, Any]) -> List[TaskAllocation]:
        """Allocate based on current agent load"""
        # Simplified load balancing - in practice would track agent utilization
        allocations = []

        # For now, use capability-based with load consideration
        capability_allocations = await self._capability_based_allocation(task)

        # Could add load balancing logic here
        allocations.extend(capability_allocations[:2])  # Limit to 2 agents for load balancing

        return allocations

    async def _consensus_driven_allocation(self, task: Dict[str, Any]) -> List[TaskAllocation]:
        """Allocate for consensus-based decision making"""
        allocations = []

        # For consensus tasks, allocate to multiple agents
        agent_ids = list(self.agents.keys())[:4]  # Up to 4 agents for consensus

        for i, agent_id in enumerate(agent_ids):
            allocations.append(TaskAllocation(
                task_id=f"task_{self.task_counter}",
                agent_id=agent_id,
                subtask=task.copy(),  # Same task for all agents
                priority=2
            ))

        return allocations

    def _create_subtask(self, task: Dict[str, Any], agent_id: str, index: int) -> Dict[str, Any]:
        """Create a subtask for an agent"""
        subtask = task.copy()

        # Add agent-specific context
        subtask['agent_id'] = agent_id
        subtask['subtask_index'] = index

        # Could split task into smaller pieces here
        return subtask

    async def _execute_allocations(self, allocations: List[TaskAllocation],
                                 task_id: str) -> Dict[str, Any]:
        """Execute task allocations"""
        results = {}

        # Execute allocations concurrently
        tasks = []
        for allocation in allocations:
            task = asyncio.create_task(self._execute_single_allocation(allocation))
            tasks.append((allocation.agent_id, task))

        # Wait for all to complete
        for agent_id, task in tasks:
            try:
                result = await asyncio.wait_for(task, timeout=300.0)  # 5 minute timeout
                results[agent_id] = result
            except asyncio.TimeoutError:
                logger.warning(f"Agent {agent_id} timed out")
                results[agent_id] = {'error': 'timeout', 'confidence': 0.0}
            except Exception as e:
                logger.error(f"Agent {agent_id} failed: {e}")
                results[agent_id] = {'error': str(e), 'confidence': 0.0}

        return results

    async def _execute_single_allocation(self, allocation: TaskAllocation) -> Dict[str, Any]:
        """Execute a single task allocation"""
        agent = self.agents.get(allocation.agent_id)
        if not agent:
            return {'error': 'agent_not_found', 'confidence': 0.0}

        # Execute task on agent
        result = await agent.execute_task(allocation.subtask)

        return result

    async def _coordinate_results(self, results: Dict[str, Any],
                                original_task: Dict[str, Any]) -> CoordinationResult:
        """Coordinate results from multiple agents"""
        start_time = time.time()

        # Filter out errors
        valid_results = {k: v for k, v in results.items() if 'error' not in v}

        if not valid_results:
            return CoordinationResult(
                task_id=original_task.get('id', 'unknown'),
                results={'error': 'all_agents_failed'},
                consensus_score=0.0,
                execution_time=time.time() - start_time,
                agent_contributions={}
            )

        # Calculate consensus
        consensus_score = self._calculate_consensus(valid_results)

        # Aggregate results
        aggregated_result = self._aggregate_results(valid_results, original_task)

        # Calculate agent contributions
        agent_contributions = self._calculate_contributions(valid_results)

        execution_time = time.time() - start_time

        return CoordinationResult(
            task_id=original_task.get('id', 'unknown'),
            results=aggregated_result,
            consensus_score=consensus_score,
            execution_time=execution_time,
            agent_contributions=agent_contributions
        )

    def _calculate_consensus(self, results: Dict[str, Any]) -> float:
        """Calculate consensus score among agent results"""
        if len(results) <= 1:
            return 1.0

        # Simple consensus based on result similarity
        # In practice, this would be more sophisticated
        confidences = [r.get('confidence', 0.5) for r in results.values()]
        avg_confidence = np.mean(confidences)

        # Agreement factor (simplified)
        agreement = 1.0  # Would calculate based on result similarity

        return (avg_confidence + agreement) / 2

    def _aggregate_results(self, results: Dict[str, Any], task: Dict[str, Any]) -> Dict[str, Any]:
        """Aggregate results from multiple agents"""
        if len(results) == 1:
            return list(results.values())[0]

        # Simple voting/averaging for different result types
        result_type = task.get('result_type', 'classification')

        if result_type == 'classification':
            # Majority voting
            predictions = [r.get('prediction') for r in results.values()]
            if predictions:
                # Simple majority (could be weighted)
                aggregated = max(set(predictions), key=predictions.count)
            else:
                aggregated = None

        elif result_type == 'regression':
            # Average predictions
            predictions = [r.get('prediction', 0.0) for r in results.values()]
            aggregated = np.mean(predictions)

        else:
            # Default: return all results
            aggregated = results

        # Calculate average confidence
        confidences = [r.get('confidence', 0.5) for r in results.values()]
        avg_confidence = np.mean(confidences)

        return {
            'aggregated_result': aggregated,
            'average_confidence': avg_confidence,
            'individual_results': results,
            'num_agents': len(results)
        }

    def _calculate_contributions(self, results: Dict[str, Any]) -> Dict[str, float]:
        """Calculate contribution scores for each agent"""
        contributions = {}

        for agent_id, result in results.items():
            confidence = result.get('confidence', 0.5)
            # Could add other factors like speed, accuracy, etc.
            contributions[agent_id] = confidence

        return contributions

    def _handle_message(self, message: AgentMessage):
        """Handle inter-agent message"""
        logger.debug(f"Handling message from {message.sender_id} to {message.receiver_id}")

        # Route message to appropriate agent
        receiver = self.agents.get(message.receiver_id)
        if receiver:
            # In a real implementation, this would be async
            asyncio.run(receiver.receive_message(message))
        else:
            logger.warning(f"Message receiver not found: {message.receiver_id}")

    def _check_completed_tasks(self):
        """Check for completed tasks and clean up"""
        completed_tasks = []

        for task_id, task_data in self.active_tasks.items():
            if task_data.get('status') in ['completed', 'failed', 'cancelled']:
                # Move to result queue
                self.result_queue.put(task_data)
                completed_tasks.append(task_id)

        # Remove completed tasks
        for task_id in completed_tasks:
            del self.active_tasks[task_id]

class LegalAIAgent:
    """Base class for legal AI agents"""

    def __init__(self, agent_id: str, capabilities: List[str]):
        self.agent_id = agent_id
        self.capabilities = capabilities
        self.status = 'idle'
        self.message_queue = queue.Queue()

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a task - to be implemented by subclasses"""
        raise NotImplementedError

    async def receive_message(self, message: AgentMessage):
        """Receive message from another agent"""
        self.message_queue.put(message)

    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return {
            'agent_id': self.agent_id,
            'status': self.status,
            'capabilities': self.capabilities,
            'queue_size': self.message_queue.qsize()
        }

# Specialized Legal AI Agents

class ContractAnalyzerAgent(LegalAIAgent):
    """Agent specialized in contract analysis"""

    def __init__(self):
        super().__init__(
            'contract_analyzer',
            ['contract_parsing', 'clause_extraction', 'risk_assessment']
        )

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        self.status = 'working'

        try:
            # Simulate contract analysis
            await asyncio.sleep(0.5)  # Simulate processing time

            result = {
                'prediction': 'high_risk_contract',
                'confidence': 0.85,
                'risk_factors': ['unusual_payment_terms', 'weak_liability_limits'],
                'recommendations': ['review_payment_schedule', 'strengthen_liability_clause']
            }

        finally:
            self.status = 'idle'

        return result

class CasePredictorAgent(LegalAIAgent):
    """Agent specialized in case outcome prediction"""

    def __init__(self):
        super().__init__(
            'case_predictor',
            ['precedent_analysis', 'outcome_prediction', 'probability_estimation']
        )

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        self.status = 'working'

        try:
            # Simulate case prediction
            await asyncio.sleep(0.7)

            result = {
                'prediction': 'favorable_outcome',
                'confidence': 0.72,
                'success_probability': 0.68,
                'key_factors': ['strong_precedent', 'favorable_jurisdiction']
            }

        finally:
            self.status = 'idle'

        return result

class DocumentProcessorAgent(LegalAIAgent):
    """Agent specialized in document processing"""

    def __init__(self):
        super().__init__(
            'document_processor',
            ['ocr_processing', 'entity_extraction', 'document_classification']
        )

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        self.status = 'working'

        try:
            # Simulate document processing
            await asyncio.sleep(0.3)

            result = {
                'document_type': 'contract',
                'confidence': 0.91,
                'entities': ['party_a', 'party_b', 'effective_date'],
                'processing_time': 0.3
            }

        finally:
            self.status = 'idle'

        return result

class LegalResearchAgent(LegalAIAgent):
    """Agent specialized in legal research"""

    def __init__(self):
        super().__init__(
            'legal_researcher',
            ['semantic_search', 'citation_analysis', 'relevance_ranking']
        )

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        self.status = 'working'

        try:
            # Simulate legal research
            await asyncio.sleep(0.8)

            result = {
                'relevant_cases': ['case_123', 'case_456', 'case_789'],
                'confidence': 0.78,
                'citation_strength': 'moderate',
                'search_query': task.get('query', 'general_contract_law')
            }

        finally:
            self.status = 'idle'

        return result

class ComplianceMonitorAgent(LegalAIAgent):
    """Agent specialized in compliance monitoring"""

    def __init__(self):
        super().__init__(
            'compliance_monitor',
            ['regulation_tracking', 'compliance_checking', 'risk_monitoring']
        )

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        self.status = 'working'

        try:
            # Simulate compliance checking
            await asyncio.sleep(0.6)

            result = {
                'compliance_status': 'compliant',
                'confidence': 0.88,
                'checked_regulations': ['gdpr', 'ccpa', 'contract_law'],
                'risk_level': 'low'
            }

        finally:
            self.status = 'idle'

        return result