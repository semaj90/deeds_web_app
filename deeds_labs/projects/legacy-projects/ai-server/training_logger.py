#!/usr/bin/env python3
"""
Adapter Training Logger for QLoRA Fine-tuning
Tracks training runs, metrics, and checkpoint versions with structured logging.

Usage:
    from training_logger import AdapterTrainingLogger
    
    logger = AdapterTrainingLogger(log_dir='logs/qlora_training')
    run_id = logger.start_run(config)
    
    for epoch in range(num_epochs):
        loss = train_epoch(...)
        metrics = evaluate(...)
        logger.log_epoch(epoch, loss, metrics)
        logger.log_checkpoint(epoch, adapter_path, size_mb)
    
    logger.finalize_run(final_metrics)
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import matplotlib.pyplot as plt
import pandas as pd


class AdapterTrainingLogger:
    """Structured logging for PEFT adapter training runs"""
    
    def __init__(self, log_dir: str = 'logs/qlora_training', experiment_name: str = 'legal_qlora'):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.experiment_name = experiment_name
        self.current_run: Optional[Dict[str, Any]] = None
        self.run_id: Optional[str] = None
        
    def start_run(self, config: Dict[str, Any]) -> str:
        """Start a new training run with configuration"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        config_hash = self._hash_config(config)
        self.run_id = f"{self.experiment_name}_{timestamp}_{config_hash[:8]}"
        
        self.current_run = {
            'run_id': self.run_id,
            'experiment_name': self.experiment_name,
            'timestamp': timestamp,
            'start_time': datetime.now().isoformat(),
            'config': config,
            'config_hash': config_hash,
            'metrics': [],
            'checkpoints': [],
            'status': 'running',
            'git_commit': self._get_git_commit(),
        }
        
        # Save initial config
        self._save_json()
        print(f"✅ Started training run: {self.run_id}")
        print(f"📁 Logs: {self.log_dir / self.run_id}_summary.json")
        
        return self.run_id
    
    def log_epoch(self, epoch: int, train_loss: float, eval_metrics: Optional[Dict[str, float]] = None):
        """Log metrics for a training epoch"""
        if not self.current_run:
            raise RuntimeError("No active training run. Call start_run() first.")
        
        epoch_data = {
            'epoch': epoch,
            'train_loss': train_loss,
            'timestamp': datetime.now().isoformat()
        }
        
        if eval_metrics:
            epoch_data.update(eval_metrics)
        
        self.current_run['metrics'].append(epoch_data)
        self._save_json()
        
        # Print progress
        print(f"Epoch {epoch}: loss={train_loss:.4f}", end='')
        if eval_metrics:
            for key, value in eval_metrics.items():
                print(f", {key}={value:.4f}", end='')
        print()
    
    def log_checkpoint(self, epoch: int, adapter_path: str, size_mb: float, 
                       eval_score: Optional[float] = None):
        """Log checkpoint information"""
        if not self.current_run:
            raise RuntimeError("No active training run. Call start_run() first.")
        
        checkpoint_data = {
            'epoch': epoch,
            'adapter_path': str(adapter_path),
            'size_mb': round(size_mb, 2),
            'timestamp': datetime.now().isoformat(),
            'eval_score': eval_score
        }
        
        self.current_run['checkpoints'].append(checkpoint_data)
        self._save_json()
        
        print(f"💾 Checkpoint saved: {adapter_path} ({size_mb:.1f} MB)")
    
    def log_hyperparameters(self, **kwargs):
        """Log additional hyperparameters during training"""
        if not self.current_run:
            raise RuntimeError("No active training run.")
        
        if 'runtime_params' not in self.current_run:
            self.current_run['runtime_params'] = {}
        
        self.current_run['runtime_params'].update(kwargs)
        self._save_json()
    
    def finalize_run(self, final_metrics: Optional[Dict[str, float]] = None, 
                     status: str = 'completed'):
        """Finalize the training run and generate summary"""
        if not self.current_run:
            raise RuntimeError("No active training run.")
        
        self.current_run['end_time'] = datetime.now().isoformat()
        self.current_run['status'] = status
        
        if final_metrics:
            self.current_run['final_metrics'] = final_metrics
        
        # Calculate training duration
        start = datetime.fromisoformat(self.current_run['start_time'])
        end = datetime.fromisoformat(self.current_run['end_time'])
        duration = (end - start).total_seconds()
        self.current_run['duration_seconds'] = duration
        self.current_run['duration_human'] = self._format_duration(duration)
        
        # Save final JSON
        self._save_json()
        
        # Generate markdown report
        self._create_markdown_report()
        
        # Generate loss curves
        if len(self.current_run['metrics']) > 0:
            self._plot_training_curves()
        
        print(f"\n✅ Training run finalized: {self.run_id}")
        print(f"📊 Report: {self.log_dir / f'{self.run_id}_report.md'}")
        print(f"📈 Plots: {self.log_dir / f'{self.run_id}_curves.png'}")
        
        # Reset current run
        self.current_run = None
        self.run_id = None
    
    def _save_json(self):
        """Save current run data to JSON"""
        if not self.current_run or not self.run_id:
            return
        
        json_file = self.log_dir / f"{self.run_id}_summary.json"
        with open(json_file, 'w') as f:
            json.dump(self.current_run, f, indent=2)
    
    def _create_markdown_report(self):
        """Generate human-readable markdown report"""
        if not self.current_run or not self.run_id:
            return
        
        md_file = self.log_dir / f"{self.run_id}_report.md"
        
        with open(md_file, 'w') as f:
            f.write(f"# QLoRA Adapter Training Report\n\n")
            f.write(f"**Run ID:** {self.run_id}\n")
            f.write(f"**Experiment:** {self.experiment_name}\n")
            f.write(f"**Started:** {self.current_run['start_time']}\n")
            f.write(f"**Ended:** {self.current_run.get('end_time', 'N/A')}\n")
            f.write(f"**Duration:** {self.current_run.get('duration_human', 'N/A')}\n")
            f.write(f"**Status:** {self.current_run['status']}\n")
            f.write(f"**Config Hash:** {self.current_run['config_hash']}\n\n")
            
            # Configuration
            f.write("## Configuration\n\n")
            f.write("```json\n")
            f.write(json.dumps(self.current_run['config'], indent=2))
            f.write("\n```\n\n")
            
            # Training Metrics
            if self.current_run['metrics']:
                f.write("## Training Metrics\n\n")
                f.write("| Epoch | Train Loss | Eval Loss | Eval Accuracy | Timestamp |\n")
                f.write("|-------|------------|-----------|---------------|----------|\n")
                
                for m in self.current_run['metrics']:
                    epoch = m['epoch']
                    train_loss = f"{m['train_loss']:.4f}"
                    eval_loss = f"{m.get('eval_loss', 'N/A'):.4f}" if 'eval_loss' in m else 'N/A'
                    eval_acc = f"{m.get('eval_accuracy', 'N/A'):.4f}" if 'eval_accuracy' in m else 'N/A'
                    timestamp = m['timestamp'].split('T')[1][:8]
                    f.write(f"| {epoch} | {train_loss} | {eval_loss} | {eval_acc} | {timestamp} |\n")
                
                f.write("\n")
            
            # Checkpoints
            if self.current_run['checkpoints']:
                f.write("## Checkpoints\n\n")
                f.write("| Epoch | Path | Size | Eval Score |\n")
                f.write("|-------|------|------|------------|\n")
                
                for cp in self.current_run['checkpoints']:
                    epoch = cp['epoch']
                    path = cp['adapter_path'].split('/')[-1]
                    size = f"{cp['size_mb']} MB"
                    score = f"{cp.get('eval_score', 'N/A'):.4f}" if cp.get('eval_score') else 'N/A'
                    f.write(f"| {epoch} | {path} | {size} | {score} |\n")
                
                f.write("\n")
            
            # Final Metrics
            if 'final_metrics' in self.current_run:
                f.write("## Final Metrics\n\n")
                for key, value in self.current_run['final_metrics'].items():
                    f.write(f"- **{key}:** {value:.4f}\n")
                f.write("\n")
            
            # Best Checkpoint
            if self.current_run['checkpoints']:
                best_cp = max(self.current_run['checkpoints'], 
                             key=lambda x: x.get('eval_score', 0))
                f.write("## Best Checkpoint\n\n")
                f.write(f"- **Epoch:** {best_cp['epoch']}\n")
                f.write(f"- **Path:** {best_cp['adapter_path']}\n")
                f.write(f"- **Eval Score:** {best_cp.get('eval_score', 'N/A')}\n\n")
            
            # Git Info
            if self.current_run.get('git_commit'):
                f.write("## Version Control\n\n")
                f.write(f"- **Git Commit:** {self.current_run['git_commit']}\n\n")
    
    def _plot_training_curves(self):
        """Generate training loss curves"""
        if not self.current_run or not self.run_id:
            return
        
        metrics = self.current_run['metrics']
        if not metrics:
            return
        
        df = pd.DataFrame(metrics)
        
        fig, axes = plt.subplots(1, 2 if 'eval_loss' in df.columns else 1, figsize=(12, 5))
        
        if not isinstance(axes, list):
            axes = [axes]
        
        # Training loss
        axes[0].plot(df['epoch'], df['train_loss'], marker='o', label='Train Loss')
        axes[0].set_xlabel('Epoch')
        axes[0].set_ylabel('Loss')
        axes[0].set_title('Training Loss')
        axes[0].grid(True, alpha=0.3)
        axes[0].legend()
        
        # Eval metrics
        if 'eval_loss' in df.columns and len(axes) > 1:
            axes[1].plot(df['epoch'], df['eval_loss'], marker='s', label='Eval Loss', color='orange')
            if 'eval_accuracy' in df.columns:
                ax2 = axes[1].twinx()
                ax2.plot(df['epoch'], df['eval_accuracy'], marker='^', label='Eval Accuracy', color='green')
                ax2.set_ylabel('Accuracy')
                ax2.legend(loc='upper right')
            
            axes[1].set_xlabel('Epoch')
            axes[1].set_ylabel('Loss')
            axes[1].set_title('Evaluation Metrics')
            axes[1].grid(True, alpha=0.3)
            axes[1].legend(loc='upper left')
        
        plt.tight_layout()
        plot_file = self.log_dir / f"{self.run_id}_curves.png"
        plt.savefig(plot_file, dpi=150, bbox_inches='tight')
        plt.close()
    
    @staticmethod
    def _hash_config(config: Dict[str, Any]) -> str:
        """Generate hash of configuration for versioning"""
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()
    
    @staticmethod
    def _format_duration(seconds: float) -> str:
        """Format duration in human-readable format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        parts = []
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")
        
        return " ".join(parts)
    
    @staticmethod
    def _get_git_commit() -> Optional[str]:
        """Get current git commit hash"""
        try:
            import subprocess
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        return None


# Example usage
if __name__ == '__main__':
    logger = AdapterTrainingLogger()
    
    config = {
        'model': 'google/gemma-2-2b',
        'lora_r': 16,
        'lora_alpha': 32,
        'epochs': 3,
        'batch_size': 4,
        'learning_rate': 2e-4
    }
    
    run_id = logger.start_run(config)
    
    # Simulate training
    for epoch in range(1, 4):
        train_loss = 1.5 / epoch
        eval_metrics = {
            'eval_loss': 1.3 / epoch,
            'eval_accuracy': 0.6 + (epoch * 0.1)
        }
        
        logger.log_epoch(epoch, train_loss, eval_metrics)
        logger.log_checkpoint(
            epoch,
            f'adapters/{run_id}/checkpoint-{epoch}',
            12.5,
            eval_score=eval_metrics['eval_accuracy']
        )
    
    logger.finalize_run({'best_accuracy': 0.87})
