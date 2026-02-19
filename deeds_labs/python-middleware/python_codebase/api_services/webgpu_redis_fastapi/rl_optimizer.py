# Reinforcement Learning Optimizer for cached GPU computations
import asyncio
import json
import time
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque, defaultdict
import redis.asyncio as redis
import logging

class ActionType(Enum):
    CACHE_GPU = "cache_gpu"
    CACHE_REDIS = "cache_redis"
    CACHE_DISK = "cache_disk"
    EVICT_GPU = "evict_gpu"
    COMPRESS_TENSOR = "compress_tensor"
    PREFETCH_TENSOR = "prefetch_tensor"
    OPTIMIZE_LAYOUT = "optimize_layout"

@dataclass
class RLState:
    """State representation for RL agent"""
    gpu_memory_usage: float  # 0-1
    cache_hit_rate: float    # 0-1
    tensor_access_frequency: float  # normalized
    computation_complexity: float   # 0-1
    user_priority: float     # 0-1
    model_performance: float # 0-1
    time_of_day: float      # 0-1 (normalized hour)
    case_urgency: float     # 0-1

@dataclass
class RLAction:
    """Action representation for RL agent"""
    action_type: ActionType
    tensor_ids: List[str]
    parameters: Dict[str, Any]

@dataclass
class RLReward:
    """Reward calculation components"""
    performance_gain: float
    memory_efficiency: float
    cache_hit_improvement: float
    user_satisfaction: float
    energy_efficiency: float
    total_reward: float

@dataclass
class Experience:
    """Experience for replay buffer"""
    state: RLState
    action: RLAction
    reward: float
    next_state: RLState
    done: bool
    timestamp: float

class DQNNetwork(nn.Module):
    """Deep Q-Network for tensor cache optimization"""

    def __init__(self, state_dim: int = 8, action_dim: int = 7, hidden_dim: int = 256):
        super().__init__()

        self.state_dim = state_dim
        self.action_dim = action_dim

        # Feature extraction layers
        self.feature_net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU()
        )

        # Value and advantage streams (Dueling DQN)
        self.value_stream = nn.Sequential(
            nn.Linear(hidden_dim // 2, hidden_dim // 4),
            nn.ReLU(),
            nn.Linear(hidden_dim // 4, 1)
        )

        self.advantage_stream = nn.Sequential(
            nn.Linear(hidden_dim // 2, hidden_dim // 4),
            nn.ReLU(),
            nn.Linear(hidden_dim // 4, action_dim)
        )

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        features = self.feature_net(state)

        value = self.value_stream(features)
        advantage = self.advantage_stream(features)

        # Combine value and advantage
        q_values = value + (advantage - advantage.mean(dim=1, keepdim=True))

        return q_values

class ReinforcementLearningOptimizer:
    """RL-based optimizer for tensor cache management"""

    def __init__(
        self,
        learning_rate: float = 3e-4,
        gamma: float = 0.99,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.01,
        epsilon_decay: float = 0.995,
        replay_buffer_size: int = 100000,
        batch_size: int = 64,
        target_update_freq: int = 1000
    ):
        self.learning_rate = learning_rate
        self.gamma = gamma
        self.epsilon = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay
        self.replay_buffer_size = replay_buffer_size
        self.batch_size = batch_size
        self.target_update_freq = target_update_freq

        # Neural networks
        self.q_network = DQNNetwork()
        self.target_network = DQNNetwork()
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)

        # Experience replay
        self.replay_buffer = deque(maxlen=replay_buffer_size)

        # State tracking
        self.current_state: Optional[RLState] = None
        self.last_action: Optional[RLAction] = None

        # Performance tracking
        self.episode_rewards: List[float] = []
        self.episode_losses: List[float] = []

        # Memory cache reference
        self.memory_cache = None

        # Redis connection
        self.redis_client: Optional[redis.Redis] = None

        # Training metrics
        self.training_step = 0
        self.episodes_completed = 0

        # Reward calculation weights
        self.reward_weights = {
            'performance': 0.3,
            'memory_efficiency': 0.25,
            'cache_hit_rate': 0.2,
            'user_satisfaction': 0.15,
            'energy_efficiency': 0.1
        }

    async def initialize(self, memory_cache, redis_url: str = "redis://localhost:6379"):
        """Initialize RL optimizer"""
        self.memory_cache = memory_cache

        self.redis_client = await redis.from_url(
            redis_url,
            password=os.getenv("REDIS_PASSWORD", "redis")
        )

        # Load existing model if available
        await self._load_model()

        # Initialize target network
        self.target_network.load_state_dict(self.q_network.state_dict())

        logging.info("RL Optimizer initialized")

    async def get_optimized_params(
        self,
        case_id: str,
        prompt: str,
        current_metrics: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """Get RL-optimized parameters for inference"""

        # Create current state
        state = await self._create_state(case_id, prompt, current_metrics)

        # Get optimal action
        action = await self._select_action(state)

        # Convert action to inference parameters
        params = await self._action_to_params(action, case_id)

        # Store state-action for future reward calculation
        self.current_state = state
        self.last_action = action

        return params

    async def record_performance(
        self,
        case_id: str,
        performance_metrics: Dict[str, float],
        user_feedback: Optional[Dict[str, float]] = None
    ):
        """Record performance and calculate reward"""

        if not self.current_state or not self.last_action:
            return

        # Calculate reward
        reward_components = await self._calculate_reward(
            performance_metrics,
            user_feedback
        )

        # Create next state
        next_state = await self._create_state(case_id, "", performance_metrics)

        # Store experience
        experience = Experience(
            state=self.current_state,
            action=self.last_action,
            reward=reward_components.total_reward,
            next_state=next_state,
            done=True,  # Episodic for now
            timestamp=time.time()
        )

        self.replay_buffer.append(experience)

        # Update episode tracking
        self.episode_rewards.append(reward_components.total_reward)

        # Train if enough experiences
        if len(self.replay_buffer) >= self.batch_size:
            await self._train_step()

        # Reset for next episode
        self.current_state = None
        self.last_action = None
        self.episodes_completed += 1

        # Periodic model saving
        if self.episodes_completed % 100 == 0:
            await self._save_model()

    async def _create_state(
        self,
        case_id: str,
        prompt: str,
        metrics: Optional[Dict[str, float]] = None
    ) -> RLState:
        """Create state representation from current system state"""

        if not metrics:
            metrics = {}

        # Get cache statistics
        cache_stats = await self.memory_cache.get_status() if self.memory_cache else {}

        # Calculate state features
        gpu_memory_usage = min(1.0, cache_stats.get('memory_usage_mb', 0) / 8192)  # Assume 8GB max
        cache_hit_rate = metrics.get('cache_hit_rate', 0.5)

        # Analyze tensor access patterns
        tensor_access_freq = await self._calculate_access_frequency(case_id)

        # Estimate computation complexity from prompt length and type
        computation_complexity = min(1.0, len(prompt) / 2000)  # Normalize by max length

        # Get user priority (from case metadata)
        user_priority = await self._get_user_priority(case_id)

        # Current model performance
        model_performance = metrics.get('accuracy', 0.5)

        # Time of day (circadian optimization)
        time_of_day = (time.time() % 86400) / 86400  # 0-1 for 24 hours

        # Case urgency
        case_urgency = await self._get_case_urgency(case_id)

        return RLState(
            gpu_memory_usage=gpu_memory_usage,
            cache_hit_rate=cache_hit_rate,
            tensor_access_frequency=tensor_access_freq,
            computation_complexity=computation_complexity,
            user_priority=user_priority,
            model_performance=model_performance,
            time_of_day=time_of_day,
            case_urgency=case_urgency
        )

    async def _select_action(self, state: RLState) -> RLAction:
        """Select action using epsilon-greedy policy"""

        if np.random.random() < self.epsilon:
            # Random action (exploration)
            action_type = np.random.choice(list(ActionType))
            tensor_ids = []  # Random tensor selection would go here
            parameters = {}
        else:
            # Greedy action (exploitation)
            state_tensor = torch.FloatTensor([
                state.gpu_memory_usage,
                state.cache_hit_rate,
                state.tensor_access_frequency,
                state.computation_complexity,
                state.user_priority,
                state.model_performance,
                state.time_of_day,
                state.case_urgency
            ]).unsqueeze(0)

            with torch.no_grad():
                q_values = self.q_network(state_tensor)
                action_idx = q_values.argmax().item()

            action_type = list(ActionType)[action_idx]
            tensor_ids = await self._select_relevant_tensors(state, action_type)
            parameters = await self._get_action_parameters(state, action_type)

        # Decay epsilon
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)

        return RLAction(
            action_type=action_type,
            tensor_ids=tensor_ids,
            parameters=parameters
        )

    async def _action_to_params(
        self,
        action: RLAction,
        case_id: str
    ) -> Dict[str, Any]:
        """Convert RL action to inference parameters"""

        params = {
            'temperature': 0.7,
            'top_p': 0.9,
            'max_tokens': 1024,
            'cache_strategy': 'default'
        }

        if action.action_type == ActionType.CACHE_GPU:
            params['use_gpu_cache'] = True
            params['cache_priority'] = 'high'

        elif action.action_type == ActionType.COMPRESS_TENSOR:
            params['compression'] = 'float16'
            params['memory_optimization'] = True

        elif action.action_type == ActionType.PREFETCH_TENSOR:
            params['prefetch_related'] = True
            params['context_window'] = 'extended'

        elif action.action_type == ActionType.OPTIMIZE_LAYOUT:
            params['memory_layout'] = 'optimized'
            params['batch_processing'] = True

        # Dynamic parameter adjustment based on action parameters
        params.update(action.parameters)

        return params

    async def _calculate_reward(
        self,
        performance_metrics: Dict[str, float],
        user_feedback: Optional[Dict[str, float]] = None
    ) -> RLReward:
        """Calculate reward based on multiple factors"""

        # Performance gain (latency reduction, accuracy improvement)
        baseline_latency = 2000  # ms
        actual_latency = performance_metrics.get('latency_ms', baseline_latency)
        performance_gain = max(0, (baseline_latency - actual_latency) / baseline_latency)

        # Memory efficiency (GPU utilization, cache efficiency)
        memory_efficiency = min(1.0, performance_metrics.get('memory_efficiency', 0.5))

        # Cache hit rate improvement
        baseline_hit_rate = 0.5
        actual_hit_rate = performance_metrics.get('cache_hit_rate', baseline_hit_rate)
        cache_hit_improvement = max(0, actual_hit_rate - baseline_hit_rate)

        # User satisfaction (from feedback or response quality)
        user_satisfaction = 0.7  # Default
        if user_feedback:
            user_satisfaction = user_feedback.get('satisfaction', 0.7)

        # Energy efficiency (lower power consumption)
        energy_efficiency = performance_metrics.get('energy_efficiency', 0.5)

        # Calculate weighted total reward
        total_reward = (
            self.reward_weights['performance'] * performance_gain +
            self.reward_weights['memory_efficiency'] * memory_efficiency +
            self.reward_weights['cache_hit_rate'] * cache_hit_improvement +
            self.reward_weights['user_satisfaction'] * user_satisfaction +
            self.reward_weights['energy_efficiency'] * energy_efficiency
        )

        return RLReward(
            performance_gain=performance_gain,
            memory_efficiency=memory_efficiency,
            cache_hit_improvement=cache_hit_improvement,
            user_satisfaction=user_satisfaction,
            energy_efficiency=energy_efficiency,
            total_reward=total_reward
        )

    async def _train_step(self):
        """Perform one training step"""

        if len(self.replay_buffer) < self.batch_size:
            return

        # Sample batch from replay buffer
        batch = np.random.choice(self.replay_buffer, self.batch_size, replace=False)

        # Prepare batch tensors
        states = torch.FloatTensor([
            [exp.state.gpu_memory_usage, exp.state.cache_hit_rate,
             exp.state.tensor_access_frequency, exp.state.computation_complexity,
             exp.state.user_priority, exp.state.model_performance,
             exp.state.time_of_day, exp.state.case_urgency]
            for exp in batch
        ])

        actions = torch.LongTensor([
            list(ActionType).index(exp.action.action_type) for exp in batch
        ])

        rewards = torch.FloatTensor([exp.reward for exp in batch])

        next_states = torch.FloatTensor([
            [exp.next_state.gpu_memory_usage, exp.next_state.cache_hit_rate,
             exp.next_state.tensor_access_frequency, exp.next_state.computation_complexity,
             exp.next_state.user_priority, exp.next_state.model_performance,
             exp.next_state.time_of_day, exp.next_state.case_urgency]
            for exp in batch
        ])

        dones = torch.BoolTensor([exp.done for exp in batch])

        # Current Q values
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))

        # Next Q values from target network
        with torch.no_grad():
            next_q_values = self.target_network(next_states).max(1)[0]
            target_q_values = rewards + (self.gamma * next_q_values * ~dones)

        # Calculate loss
        loss = nn.MSELoss()(current_q_values.squeeze(), target_q_values)

        # Optimize
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        # Update target network periodically
        self.training_step += 1
        if self.training_step % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())

        # Track loss
        self.episode_losses.append(loss.item())

    async def _calculate_access_frequency(self, case_id: str) -> float:
        """Calculate tensor access frequency for case"""
        if not self.redis_client:
            return 0.5

        # Get case access history
        access_key = f"case_access:{case_id}"
        access_count = await self.redis_client.get(access_key)

        if access_count:
            # Normalize access count (assuming max 100 accesses)
            return min(1.0, int(access_count) / 100)

        return 0.1  # New case

    async def _get_user_priority(self, case_id: str) -> float:
        """Get user priority for case"""
        if not self.redis_client:
            return 0.5

        priority_key = f"case_priority:{case_id}"
        priority = await self.redis_client.get(priority_key)

        if priority:
            # Convert string priority to float
            priority_map = {'low': 0.2, 'medium': 0.5, 'high': 0.8, 'urgent': 1.0}
            return priority_map.get(priority.decode(), 0.5)

        return 0.5

    async def _get_case_urgency(self, case_id: str) -> float:
        """Get case urgency based on deadlines and importance"""
        # Simplified urgency calculation
        return 0.5  # Default medium urgency

    async def _select_relevant_tensors(
        self,
        state: RLState,
        action_type: ActionType
    ) -> List[str]:
        """Select relevant tensors for action"""
        # Simplified tensor selection
        return []

    async def _get_action_parameters(
        self,
        state: RLState,
        action_type: ActionType
    ) -> Dict[str, Any]:
        """Get parameters for specific action type"""
        return {}

    async def _save_model(self):
        """Save model state to Redis"""
        if not self.redis_client:
            return

        # Serialize model state
        model_state = {
            'q_network': self.q_network.state_dict(),
            'target_network': self.target_network.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'training_step': self.training_step,
            'epsilon': self.epsilon,
            'episodes_completed': self.episodes_completed
        }

        # Save to Redis (with compression)
        import pickle
        model_bytes = pickle.dumps(model_state)
        await self.redis_client.set("rl_model_state", model_bytes)

        logging.info(f"RL model saved at step {self.training_step}")

    async def _load_model(self):
        """Load model state from Redis"""
        if not self.redis_client:
            return

        try:
            model_bytes = await self.redis_client.get("rl_model_state")
            if model_bytes:
                import pickle
                model_state = pickle.loads(model_bytes)

                self.q_network.load_state_dict(model_state['q_network'])
                self.target_network.load_state_dict(model_state['target_network'])
                self.optimizer.load_state_dict(model_state['optimizer'])
                self.training_step = model_state['training_step']
                self.epsilon = model_state['epsilon']
                self.episodes_completed = model_state['episodes_completed']

                logging.info(f"RL model loaded from step {self.training_step}")
        except Exception as e:
            logging.warning(f"Could not load RL model: {e}")

    async def get_status(self) -> Dict[str, Any]:
        """Get RL optimizer status"""
        return {
            "training_step": self.training_step,
            "episodes_completed": self.episodes_completed,
            "epsilon": self.epsilon,
            "replay_buffer_size": len(self.replay_buffer),
            "average_reward": np.mean(self.episode_rewards[-100:]) if self.episode_rewards else 0,
            "average_loss": np.mean(self.episode_losses[-100:]) if self.episode_losses else 0,
            "model_parameters": sum(p.numel() for p in self.q_network.parameters())
        }

    async def cleanup(self):
        """Cleanup resources"""
        await self._save_model()

        if self.redis_client:
            await self.redis_client.close()

        logging.info("RL Optimizer cleaned up")