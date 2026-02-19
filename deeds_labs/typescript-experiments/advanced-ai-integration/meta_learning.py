#!/usr/bin/env python3
"""
Meta-Learning System for Legal AI
Learn how to learn more efficiently across legal domains
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
import logging
import json
from pathlib import Path
import time

logger = logging.getLogger(__name__)

@dataclass
class TaskDistribution:
    """Distribution of tasks for meta-learning"""
    task_type: str
    domains: List[str]
    few_shot_examples: int
    adaptation_steps: int
    inner_lr: float
    outer_lr: float

@dataclass
class MetaLearnerState:
    """State of the meta-learner"""
    meta_parameters: Dict[str, torch.Tensor]
    task_history: List[Dict[str, Any]]
    adaptation_performance: Dict[str, float]
    last_updated: float

class MAMLMetaLearner(nn.Module):
    """Model-Agnostic Meta-Learning implementation"""

    def __init__(self, model_config: Dict[str, Any]):
        super().__init__()
        self.input_dim = model_config.get('input_dim', 768)
        self.hidden_dim = model_config.get('hidden_dim', 512)
        self.output_dim = model_config.get('output_dim', 128)
        self.num_layers = model_config.get('num_layers', 3)

        # Build meta-learner network
        layers = []
        current_dim = self.input_dim

        for i in range(self.num_layers):
            layers.extend([
                nn.Linear(current_dim, self.hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.1)
            ])
            current_dim = self.hidden_dim

        layers.append(nn.Linear(current_dim, self.output_dim))
        self.network = nn.Sequential(*layers)

        # Meta-learning parameters
        self.inner_lr = 0.01
        self.outer_lr = 0.001
        self.adaptation_steps = 5

    def forward(self, x):
        return self.network(x)

    def adapt_to_task(self, support_set: Tuple[torch.Tensor, torch.Tensor],
                     query_set: Tuple[torch.Tensor, torch.Tensor],
                     adaptation_steps: int = 5) -> nn.Module:
        """Adapt model to new task using MAML"""
        # Create task-specific copy
        adapted_model = self.clone()

        support_x, support_y = support_set
        query_x, query_y = query_set

        # Inner loop adaptation
        for step in range(adaptation_steps):
            adapted_model.zero_grad()
            pred = adapted_model(support_x)
            loss = F.cross_entropy(pred, support_y)
            loss.backward()

            # Manual parameter update (first-order approximation)
            for param in adapted_model.parameters():
                param.data = param.data - self.inner_lr * param.grad

        return adapted_model

    def clone(self) -> 'MAMLMetaLearner':
        """Create a clone of the model for task adaptation"""
        cloned = MAMLMetaLearner({
            'input_dim': self.input_dim,
            'hidden_dim': self.hidden_dim,
            'output_dim': self.output_dim,
            'num_layers': self.num_layers
        })

        # Copy parameters
        for cloned_param, param in zip(cloned.parameters(), self.parameters()):
            cloned_param.data = param.data.clone()

        return cloned

class ReptileMetaLearner(nn.Module):
    """Reptile Meta-Learning implementation"""

    def __init__(self, model_config: Dict[str, Any]):
        super().__init__()
        self.input_dim = model_config.get('input_dim', 768)
        self.hidden_dim = model_config.get('hidden_dim', 512)
        self.output_dim = model_config.get('output_dim', 10)  # Classification
        self.num_layers = model_config.get('num_layers', 3)

        # Build network
        layers = []
        current_dim = self.input_dim

        for i in range(self.num_layers - 1):
            layers.extend([
                nn.Linear(current_dim, self.hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.1)
            ])
            current_dim = self.hidden_dim

        layers.append(nn.Linear(current_dim, self.output_dim))
        self.network = nn.Sequential(*layers)

        # Reptile parameters
        self.inner_lr = 0.01
        self.outer_lr = 0.001
        self.adaptation_steps = 10

    def forward(self, x):
        return self.network(x)

    def adapt_to_task(self, task_data: Tuple[torch.Tensor, torch.Tensor],
                     adaptation_steps: int = 10) -> 'ReptileMetaLearner':
        """Adapt to task using Reptile algorithm"""
        adapted_model = self.clone()
        optimizer = torch.optim.SGD(adapted_model.parameters(), lr=self.inner_lr)

        task_x, task_y = task_data

        # Adapt on task data
        for step in range(adaptation_steps):
            adapted_model.zero_grad()
            pred = adapted_model(task_x)
            loss = F.cross_entropy(pred, task_y)
            loss.backward()
            optimizer.step()

        return adapted_model

    def update_meta_parameters(self, adapted_models: List['ReptileMetaLearner']):
        """Update meta-parameters using Reptile update rule"""
        if not adapted_models:
            return

        # Average the adapted parameters
        avg_params = {}
        for name, param in self.named_parameters():
            avg_params[name] = torch.zeros_like(param)

        for model in adapted_models:
            for name, param in model.named_parameters():
                avg_params[name] += param

        for name in avg_params:
            avg_params[name] /= len(adapted_models)

        # Update meta-parameters towards averaged adapted parameters
        for name, meta_param in self.named_parameters():
            meta_param.data += self.outer_lr * (avg_params[name] - meta_param)

    def clone(self) -> 'ReptileMetaLearner':
        """Create a clone for adaptation"""
        cloned = ReptileMetaLearner({
            'input_dim': self.input_dim,
            'hidden_dim': self.hidden_dim,
            'output_dim': self.output_dim,
            'num_layers': self.num_layers
        })

        for cloned_param, param in zip(cloned.parameters(), self.parameters()):
            cloned_param.data = param.data.clone()

        return cloned

class TaskGenerator:
    """Generate synthetic tasks for meta-learning"""

    def __init__(self, legal_domains: List[str]):
        self.legal_domains = legal_domains
        self.task_types = {
            'classification': self._generate_classification_task,
            'regression': self._generate_regression_task,
            'sequence_labeling': self._generate_sequence_task
        }

    def generate_task(self, task_type: str, domain: str,
                     num_examples: int = 10) -> Dict[str, Any]:
        """Generate a synthetic task"""
        if task_type not in self.task_types:
            raise ValueError(f"Unknown task type: {task_type}")

        return self.task_types[task_type](domain, num_examples)

    def _generate_classification_task(self, domain: str, num_examples: int) -> Dict[str, Any]:
        """Generate classification task"""
        # Domain-specific classification tasks
        domain_configs = {
            'contract_law': {
                'classes': ['employment', 'commercial', 'nda', 'license'],
                'input_dim': 768,
                'num_classes': 4
            },
            'intellectual_property': {
                'classes': ['patent', 'trademark', 'copyright', 'trade_secret'],
                'input_dim': 768,
                'num_classes': 4
            },
            'corporate_law': {
                'classes': ['merger', 'compliance', 'governance', 'litigation'],
                'input_dim': 768,
                'num_classes': 4
            }
        }

        config = domain_configs.get(domain, domain_configs['contract_law'])

        # Generate synthetic data
        X = torch.randn(num_examples, config['input_dim'])
        y = torch.randint(0, config['num_classes'], (num_examples,))

        return {
            'type': 'classification',
            'domain': domain,
            'X': X,
            'y': y,
            'num_classes': config['num_classes'],
            'classes': config['classes']
        }

    def _generate_regression_task(self, domain: str, num_examples: int) -> Dict[str, Any]:
        """Generate regression task"""
        # Legal risk assessment, contract value prediction, etc.
        X = torch.randn(num_examples, 768)
        y = torch.randn(num_examples, 1)  # Risk score, value, etc.

        return {
            'type': 'regression',
            'domain': domain,
            'X': X,
            'y': y
        }

    def _generate_sequence_task(self, domain: str, num_examples: int) -> Dict[str, Any]:
        """Generate sequence labeling task"""
        # Entity recognition, clause identification, etc.
        seq_length = 128
        X = torch.randn(num_examples, seq_length, 768)
        y = torch.randint(0, 9, (num_examples, seq_length))  # BIO tags

        return {
            'type': 'sequence_labeling',
            'domain': domain,
            'X': X,
            'y': y,
            'seq_length': seq_length,
            'num_tags': 9
        }

class MetaLearner:
    """Main meta-learning orchestrator"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        if config is None:
            config = {}

        # Extract task distributions from config or use defaults
        task_distributions = config.get('task_distributions', {
            'contract_law': {'few_shot_examples': 10, 'adaptation_steps': 5},
            'intellectual_property': {'few_shot_examples': 10, 'adaptation_steps': 5},
            'corporate_law': {'few_shot_examples': 10, 'adaptation_steps': 5}
        })

        self.task_distributions = task_distributions
        self.task_generator = TaskGenerator(list(task_distributions.keys()))

        # Initialize meta-learners
        model_config = {
            'input_dim': 768,  # Legal text embedding dimension
            'hidden_dim': 512,
            'output_dim': 128,
            'num_layers': 3
        }

        self.maml_learner = MAMLMetaLearner(model_config)
        self.reptile_learner = ReptileMetaLearner(model_config)

        # Meta-learning state
        self.state = MetaLearnerState(
            meta_parameters={},
            task_history=[],
            adaptation_performance={},
            last_updated=time.time()
        )

        # Device
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.maml_learner.to(self.device)
        self.reptile_learner.to(self.device)

        logger.info("Meta-learner initialized")

    async def initialize(self):
        """Initialize the meta-learner"""
        # Already initialized in constructor
        pass

    async def adapt_to_task(self, task_features: Dict[str, Any],
                           few_shot_examples: List[Dict[str, Any]],
                           adaptation_steps: int = 100) -> Dict[str, Any]:
        """Adapt to a new task using meta-learning"""
        logger.info(f"Adapting to task: {task_features}")

        # Convert examples to tensors
        if few_shot_examples:
            X, y = self._prepare_examples(few_shot_examples)
        else:
            # Generate synthetic examples
            task = self.task_generator.generate_task(
                task_features.get('task_type', 'classification'),
                task_features.get('domain', 'contract_law'),
                num_examples=10
            )
            X, y = task['X'], task['y']

        X, y = X.to(self.device), y.to(self.device)

        # Split into support and query sets
        support_size = len(X) // 2
        support_set = (X[:support_size], y[:support_size])
        query_set = (X[support_size:], y[support_size:])

        # MAML adaptation
        maml_adapted = self.maml_learner.adapt_to_task(
            support_set, query_set, adaptation_steps=min(adaptation_steps, 5)
        )

        # Reptile adaptation
        reptile_adapted = self.reptile_learner.adapt_to_task(
            (X, y), adaptation_steps=min(adaptation_steps, 10)
        )

        # Evaluate adaptations
        maml_performance = self._evaluate_adaptation(maml_adapted, query_set)
        reptile_performance = self._evaluate_adaptation(reptile_adapted, query_set)

        # Choose best adaptation
        if maml_performance > reptile_performance:
            best_model = maml_adapted
            best_performance = maml_performance
            method = 'maml'
        else:
            best_model = reptile_adapted
            best_performance = reptile_performance
            method = 'reptile'

        # Update meta-learner state
        task_record = {
            'task_features': task_features,
            'adaptation_method': method,
            'performance': best_performance,
            'timestamp': time.time()
        }
        self.state.task_history.append(task_record)
        self.state.adaptation_performance[str(task_features)] = best_performance
        self.state.last_updated = time.time()

        logger.info(f"Task adaptation completed using {method} with performance: {best_performance:.4f}")

        return {
            'adapted_model': best_model,
            'method': method,
            'performance': best_performance,
            'task_features': task_features
        }

    def _prepare_examples(self, examples: List[Dict[str, Any]]) -> Tuple[torch.Tensor, torch.Tensor]:
        """Convert examples to tensors"""
        # This would depend on the specific format of examples
        # For now, create synthetic tensors
        num_examples = len(examples)
        X = torch.randn(num_examples, 768)  # Legal text embeddings
        y = torch.randint(0, 10, (num_examples,))  # Classification labels

        return X, y

    def _evaluate_adaptation(self, model: nn.Module, query_set: Tuple[torch.Tensor, torch.Tensor]) -> float:
        """Evaluate adapted model performance"""
        model.eval()
        query_x, query_y = query_set

        with torch.no_grad():
            pred = model(query_x)
            if len(pred.shape) > 1 and pred.shape[-1] > 1:
                # Classification
                pred_classes = torch.argmax(pred, dim=-1)
                accuracy = (pred_classes == query_y).float().mean().item()
                return accuracy
            else:
                # Regression or other
                mse = F.mse_loss(pred.squeeze(), query_y.float()).item()
                return 1.0 / (1.0 + mse)  # Convert to accuracy-like score

    async def meta_train(self, num_meta_iterations: int = 100):
        """Perform meta-training across multiple tasks"""
        logger.info(f"Starting meta-training for {num_meta_iterations} iterations")

        for iteration in range(num_meta_iterations):
            # Sample a batch of tasks
            task_batch = []
            adapted_models = []

            for _ in range(4):  # Meta-batch size
                # Sample random task
                domain = np.random.choice(list(self.task_distributions.keys()))
                task_type = np.random.choice(['classification', 'regression', 'sequence_labeling'])

                task = self.task_generator.generate_task(task_type, domain, num_examples=20)
                task_batch.append(task)

                # Adapt on task
                X, y = task['X'].to(self.device), task['y'].to(self.device)
                adapted = self.reptile_learner.adapt_to_task((X, y))
                adapted_models.append(adapted)

            # Update meta-parameters
            self.reptile_learner.update_meta_parameters(adapted_models)

            if (iteration + 1) % 10 == 0:
                logger.info(f"Meta-training iteration {iteration + 1}/{num_meta_iterations} completed")

        logger.info("Meta-training completed")

    def save_state(self, filepath: Path):
        """Save meta-learner state"""
        state_dict = {
            'maml_state': self.maml_learner.state_dict(),
            'reptile_state': self.reptile_learner.state_dict(),
            'meta_state': {
                'task_history': self.state.task_history,
                'adaptation_performance': self.state.adaptation_performance,
                'last_updated': self.state.last_updated
            }
        }

        torch.save(state_dict, filepath)
        logger.info(f"Meta-learner state saved to {filepath}")

    def load_state(self, filepath: Path):
        """Load meta-learner state"""
        if filepath.exists():
            state_dict = torch.load(filepath, map_location=self.device)
            self.maml_learner.load_state_dict(state_dict['maml_state'])
            self.reptile_learner.load_state_dict(state_dict['reptile_state'])

            meta_state = state_dict['meta_state']
            self.state.task_history = meta_state['task_history']
            self.state.adaptation_performance = meta_state['adaptation_performance']
            self.state.last_updated = meta_state['last_updated']

            logger.info(f"Meta-learner state loaded from {filepath}")
        else:
            logger.warning(f"State file not found: {filepath}")

    def get_adaptation_statistics(self) -> Dict[str, Any]:
        """Get statistics about adaptation performance"""
        if not self.state.task_history:
            return {}

        performances = [task['performance'] for task in self.state.task_history]
        methods = [task['adaptation_method'] for task in self.state.task_history]

        return {
            'total_adaptations': len(self.state.task_history),
            'average_performance': np.mean(performances),
            'best_performance': max(performances),
            'method_distribution': {
                'maml': methods.count('maml'),
                'reptile': methods.count('reptile')
            },
            'recent_performance': performances[-10:] if len(performances) >= 10 else performances
        }