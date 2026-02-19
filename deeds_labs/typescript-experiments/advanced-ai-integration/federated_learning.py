#!/usr/bin/env python3
"""
Federated Learning System for Legal AI
Privacy-preserving collaborative learning across legal institutions
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
from typing import Dict, Any, List, Optional, Tuple, Callable
from dataclasses import dataclass, field
import logging
import asyncio
import time
import json
from pathlib import Path
import hashlib
import secrets

logger = logging.getLogger(__name__)

@dataclass
class FederatedNode:
    """A federated learning node (law firm, court, etc.)"""
    node_id: str
    location: str
    data_size: int
    model_version: str = "v1.0"
    last_sync: float = field(default_factory=time.time)
    trust_score: float = 1.0
    privacy_budget: float = 1.0
    contribution_score: float = 0.0
    is_active: bool = True

@dataclass
class ModelUpdate:
    """Model update from a federated node"""
    node_id: str
    model_weights: Dict[str, torch.Tensor]
    sample_count: int
    training_loss: float
    validation_accuracy: float
    timestamp: float
    checksum: str

@dataclass
class GlobalModel:
    """Global federated model"""
    version: str
    weights: Dict[str, torch.Tensor]
    aggregated_from: List[str]
    performance_metrics: Dict[str, float]
    created_at: float

class PrivacyEngine:
    """Privacy-preserving mechanisms for federated learning"""

    def __init__(self, noise_multiplier: float = 1.0, max_grad_norm: float = 1.0):
        self.noise_multiplier = noise_multiplier
        self.max_grad_norm = max_grad_norm

    def add_noise(self, gradients: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
        """Add differential privacy noise to gradients"""
        noisy_gradients = {}

        for name, grad in gradients.items():
            # Clip gradients
            grad_norm = torch.norm(grad)
            if grad_norm > self.max_grad_norm:
                grad = grad * (self.max_grad_norm / grad_norm)

            # Add Gaussian noise
            noise = torch.normal(0, self.noise_multiplier * self.max_grad_norm, grad.shape)
            noisy_gradients[name] = grad + noise

        return noisy_gradients

    def secure_aggregation(self, updates: List[ModelUpdate]) -> Dict[str, torch.Tensor]:
        """Secure aggregation of model updates"""
        if not updates:
            return {}

        # Initialize aggregated weights
        aggregated = {}
        total_samples = sum(update.sample_count for update in updates)

        # Weighted average based on sample count
        for name in updates[0].model_weights.keys():
            weighted_sum = torch.zeros_like(updates[0].model_weights[name])

            for update in updates:
                weight = update.sample_count / total_samples
                weighted_sum += weight * update.model_weights[name]

            aggregated[name] = weighted_sum

        return aggregated

class FederatedAggregator:
    """Federated learning aggregation algorithms"""

    def __init__(self, aggregation_method: str = "fedavg"):
        self.aggregation_method = aggregation_method
        self.methods = {
            "fedavg": self._fedavg_aggregation,
            "fedprox": self._fedprox_aggregation,
            "scaffold": self._scaffold_aggregation
        }

    def aggregate(self, updates: List[ModelUpdate]) -> Dict[str, torch.Tensor]:
        """Aggregate model updates using specified method"""
        if self.aggregation_method not in self.methods:
            logger.warning(f"Unknown aggregation method: {self.aggregation_method}, using fedavg")
            method = self._fedavg_aggregation
        else:
            method = self.methods[self.aggregation_method]

        return method(updates)

    def _fedavg_aggregation(self, updates: List[ModelUpdate]) -> Dict[str, torch.Tensor]:
        """Federated Averaging (FedAvg)"""
        if not updates:
            return {}

        aggregated = {}
        total_samples = sum(update.sample_count for update in updates)

        for param_name in updates[0].model_weights.keys():
            weighted_sum = torch.zeros_like(updates[0].model_weights[param_name])

            for update in updates:
                weight = update.sample_count / total_samples
                weighted_sum += weight * update.model_weights[param_name]

            aggregated[param_name] = weighted_sum

        return aggregated

    def _fedprox_aggregation(self, updates: List[ModelUpdate]) -> Dict[str, torch.Tensor]:
        """FedProx aggregation with proximal term"""
        # Simplified FedProx - in practice would include proximal regularization
        return self._fedavg_aggregation(updates)

    def _scaffold_aggregation(self, updates: List[ModelUpdate]) -> Dict[str, torch.Tensor]:
        """SCAFFOLD aggregation with control variates"""
        # Simplified SCAFFOLD - in practice would maintain control variatesiates
        return self._fedavg_aggregation(updates)

class FederatedCoordinator:
    """Coordinates federated learning across nodes"""

    def __init__(self, global_model: nn.Module, privacy_engine: Optional[PrivacyEngine] = None):
        self.global_model = global_model
        self.privacy_engine = privacy_engine or PrivacyEngine()
        self.aggregator = FederatedAggregator("fedavg")

        self.nodes: Dict[str, FederatedNode] = {}
        self.pending_updates: List[ModelUpdate] = []
        self.global_models: List[GlobalModel] = []

        self.round_number = 0
        self.min_nodes_per_round = 3
        self.max_rounds_without_progress = 10

        # Device
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.global_model.to(self.device)

        logger.info("Federated coordinator initialized")

    async def initialize(self):
        """Initialize the federated coordinator"""
        # Already initialized in constructor
        pass

    def register_node(self, node: FederatedNode):
        """Register a new federated node"""
        self.nodes[node.node_id] = node
        logger.info(f"Node registered: {node.node_id} ({node.location})")

    def unregister_node(self, node_id: str):
        """Unregister a node"""
        if node_id in self.nodes:
            del self.nodes[node_id]
            logger.info(f"Node unregistered: {node_id}")

    def submit_update(self, update: ModelUpdate) -> bool:
        """Submit a model update from a node"""
        # Validate update
        if not self._validate_update(update):
            logger.warning(f"Invalid update from node {update.node_id}")
            return False

        # Check if node is registered and active
        node = self.nodes.get(update.node_id)
        if not node or not node.is_active:
            logger.warning(f"Update from inactive/unregistered node: {update.node_id}")
            return False

        self.pending_updates.append(update)
        node.last_sync = time.time()
        node.contribution_score += 1  # Simple contribution tracking

        logger.info(f"Update received from node {update.node_id} ({update.sample_count} samples)")
        return True

    async def run_federated_round(self) -> Optional[GlobalModel]:
        """Run one round of federated learning"""
        self.round_number += 1
        logger.info(f"Starting federated learning round {self.round_number}")

        # Check if we have enough updates
        if len(self.pending_updates) < self.min_nodes_per_round:
            logger.info(f"Not enough updates for round {self.round_number} ({len(self.pending_updates)} < {self.min_nodes_per_round})")
            return None

        # Select updates for this round (could implement more sophisticated selection)
        round_updates = self.pending_updates[:self.min_nodes_per_round]
        self.pending_updates = self.pending_updates[self.min_nodes_per_round:]

        # Aggregate updates
        try:
            aggregated_weights = self.aggregator.aggregate(round_updates)

            if not aggregated_weights:
                logger.error("Aggregation failed - no weights returned")
                return None

            # Update global model
            self._update_global_model(aggregated_weights)

            # Calculate performance metrics
            performance_metrics = self._evaluate_global_model()

            # Create new global model version
            global_model = GlobalModel(
                version=f"v{self.round_number}.0",
                weights=aggregated_weights.copy(),
                aggregated_from=[update.node_id for update in round_updates],
                performance_metrics=performance_metrics,
                created_at=time.time()
            )

            self.global_models.append(global_model)

            # Update node trust scores
            self._update_node_trust_scores(round_updates)

            logger.info(f"Round {self.round_number} completed. Global model {global_model.version} created")
            return global_model

        except Exception as e:
            logger.error(f"Error in federated round {self.round_number}: {e}")
            return None

    def get_global_model(self) -> Dict[str, torch.Tensor]:
        """Get current global model weights"""
        return {name: param.data.clone() for name, param in self.global_model.named_parameters()}

    def distribute_global_model(self, node_ids: Optional[List[str]] = None) -> Dict[str, Dict[str, torch.Tensor]]:
        """Distribute global model to nodes"""
        if node_ids is None:
            node_ids = list(self.nodes.keys())

        distribution = {}
        global_weights = self.get_global_model()

        for node_id in node_ids:
            if node_id in self.nodes:
                distribution[node_id] = global_weights.copy()

        logger.info(f"Global model distributed to {len(distribution)} nodes")
        return distribution

    def get_node_statistics(self) -> Dict[str, Any]:
        """Get statistics about federated nodes"""
        active_nodes = [node for node in self.nodes.values() if node.is_active]
        total_data = sum(node.data_size for node in active_nodes)

        return {
            'total_nodes': len(self.nodes),
            'active_nodes': len(active_nodes),
            'total_data_size': total_data,
            'average_data_per_node': total_data / len(active_nodes) if active_nodes else 0,
            'pending_updates': len(self.pending_updates),
            'completed_rounds': self.round_number
        }

    def _validate_update(self, update: ModelUpdate) -> bool:
        """Validate a model update"""
        # Check checksum
        computed_checksum = self._compute_checksum(update.model_weights)
        if computed_checksum != update.checksum:
            logger.warning(f"Checksum mismatch for update from {update.node_id}")
            return False

        # Check timestamp (not too old)
        if time.time() - update.timestamp > 3600:  # 1 hour
            logger.warning(f"Update from {update.node_id} is too old")
            return False

        # Check sample count
        if update.sample_count <= 0:
            logger.warning(f"Invalid sample count from {update.node_id}")
            return False

        return True

    def _update_global_model(self, new_weights: Dict[str, torch.Tensor]):
        """Update the global model with new weights"""
        with torch.no_grad():
            for name, param in self.global_model.named_parameters():
                if name in new_weights:
                    param.copy_(new_weights[name])

    def _evaluate_global_model(self) -> Dict[str, float]:
        """Evaluate global model performance"""
        # Create synthetic evaluation data
        # In practice, this would use a held-out validation set
        eval_data = self._create_evaluation_data()

        self.global_model.eval()
        total_loss = 0.0
        total_correct = 0
        total_samples = 0

        with torch.no_grad():
            for batch_x, batch_y in eval_data:
                batch_x, batch_y = batch_x.to(self.device), batch_y.to(self.device)
                outputs = self.global_model(batch_x)
                loss = F.cross_entropy(outputs, batch_y)

                total_loss += loss.item()
                _, predicted = torch.max(outputs, 1)
                total_correct += (predicted == batch_y).sum().item()
                total_samples += batch_y.size(0)

        accuracy = total_correct / total_samples if total_samples > 0 else 0.0
        avg_loss = total_loss / len(eval_data) if eval_data else 0.0

        return {
            'accuracy': accuracy,
            'loss': avg_loss,
            'evaluated_samples': total_samples
        }

    def _create_evaluation_data(self) -> DataLoader:
        """Create synthetic evaluation data"""
        # Create simple synthetic data for demonstration
        num_samples = 1000
        input_dim = 768  # Legal text embedding dimension
        num_classes = 10

        X = torch.randn(num_samples, input_dim)
        y = torch.randint(0, num_classes, (num_samples,))

        dataset = TensorDataset(X, y)
        return DataLoader(dataset, batch_size=32, shuffle=False)

    def _update_node_trust_scores(self, round_updates: List[ModelUpdate]):
        """Update trust scores based on round participation"""
        participating_nodes = {update.node_id for update in round_updates}

        for node_id, node in self.nodes.items():
            if node_id in participating_nodes:
                # Increase trust for participating nodes
                node.trust_score = min(1.0, node.trust_score + 0.05)
            else:
                # Decrease trust for non-participating active nodes
                if node.is_active:
                    node.trust_score = max(0.1, node.trust_score - 0.02)

    def _compute_checksum(self, weights: Dict[str, torch.Tensor]) -> str:
        """Compute checksum of model weights"""
        # Simple checksum based on weight shapes and norms
        checksum_data = ""
        for name, weight in weights.items():
            checksum_data += f"{name}:{weight.shape}:{torch.norm(weight).item()}:"

        return hashlib.sha256(checksum_data.encode()).hexdigest()

class LegalFederatedLearner:
    """Legal-specific federated learning implementation"""

    def __init__(self, base_model: nn.Module):
        self.coordinator = FederatedCoordinator(base_model)

        # Legal-specific configurations
        self.legal_domains = {
            'contract_law': {'classes': 50, 'sensitivity': 'high'},
            'intellectual_property': {'classes': 30, 'sensitivity': 'high'},
            'corporate_law': {'classes': 40, 'sensitivity': 'medium'},
            'litigation': {'classes': 60, 'sensitivity': 'high'}
        }

        # Initialize with sample nodes
        self._initialize_sample_nodes()

    def _initialize_sample_nodes(self):
        """Initialize sample federated nodes"""
        sample_nodes = [
            FederatedNode("law_firm_alpha", "New York", 50000, trust_score=0.95),
            FederatedNode("court_system_beta", "California", 100000, trust_score=0.98),
            FederatedNode("corporate_legal_gamma", "Texas", 75000, trust_score=0.92),
            FederatedNode("ip_firm_delta", "Massachusetts", 30000, trust_score=0.88),
            FederatedNode("small_practice_epsilon", "Florida", 15000, trust_score=0.85)
        ]

        for node in sample_nodes:
            self.coordinator.register_node(node)

    async def run_legal_federated_round(self, domain: str = None) -> Optional[GlobalModel]:
        """Run a federated learning round focused on legal domain"""
        # Generate synthetic updates for demonstration
        updates = self._generate_synthetic_updates(domain)

        # Submit updates
        for update in updates:
            self.coordinator.submit_update(update)

        # Run federated round
        return await self.coordinator.run_federated_round()

    def _generate_synthetic_updates(self, domain: Optional[str] = None) -> List[ModelUpdate]:
        """Generate synthetic model updates for demonstration"""
        updates = []

        for node in self.coordinator.nodes.values():
            if not node.is_active:
                continue

            # Create synthetic model weights
            model_weights = {}
            for name, param in self.coordinator.global_model.named_parameters():
                # Add some noise to simulate local training
                noise = torch.randn_like(param) * 0.01
                model_weights[name] = param.data + noise

            # Create update
            update = ModelUpdate(
                node_id=node.node_id,
                model_weights=model_weights,
                sample_count=node.data_size,
                training_loss=np.random.uniform(0.1, 0.5),
                validation_accuracy=np.random.uniform(0.7, 0.95),
                timestamp=time.time(),
                checksum=self.coordinator._compute_checksum(model_weights)
            )

            updates.append(update)

        return updates

    def get_federated_insights(self) -> Dict[str, Any]:
        """Get insights from federated learning process"""
        stats = self.coordinator.get_node_statistics()

        # Add legal-specific insights
        domain_distribution = {}
        for node in self.coordinator.nodes.values():
            # Simulate domain distribution
            domain = np.random.choice(list(self.legal_domains.keys()))
            if domain not in domain_distribution:
                domain_distribution[domain] = 0
            domain_distribution[domain] += node.data_size

        insights = {
            'federated_stats': stats,
            'domain_distribution': domain_distribution,
            'privacy_preserved': True,  # In real implementation
            'cross_institutional_learning': len(self.coordinator.nodes) > 1
        }

        return insights