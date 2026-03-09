# Workflow Management with Redis Pub/Sub
# Orchestrates evidence processing pipelines

import asyncio
from typing import Dict, Optional
from datetime import datetime
from cache import publish_workflow_event, redis_client
from types import WorkflowEvent
import json


class WorkflowOrchestrator:
    """Manages evidence processing workflow with Redis pub/sub"""

    def __init__(self):
        self.active_workflows: Dict[str, Dict] = {}

    async def start_workflow(
        self,
        file_id: str,
        user_id: str,
        filename: str
    ) -> Dict:
        """
        Start evidence processing workflow

        Stages: upload → ocr → embedding → analysis → storage → complete

        Args:
            file_id: Unique file identifier
            user_id: User who uploaded the file
            filename: Original filename

        Returns:
            dict: Workflow status
        """
        workflow = {
            "file_id": file_id,
            "user_id": user_id,
            "filename": filename,
            "stage": "upload",
            "progress": 0,
            "status": "processing",
            "started_at": datetime.utcnow().isoformat(),
            "error": None
        }

        self.active_workflows[file_id] = workflow

        # Publish initial event
        await self.publish_update(file_id, "upload", 10, "processing")

        print(f"[Workflow] 🚀 Started workflow for {filename} ({file_id})")
        return workflow

    async def update_stage(
        self,
        file_id: str,
        stage: str,
        progress: int,
        status: str = "processing"
    ):
        """Update workflow stage"""
        if file_id in self.active_workflows:
            self.active_workflows[file_id].update({
                "stage": stage,
                "progress": progress,
                "status": status
            })

            await self.publish_update(file_id, stage, progress, status)
            print(f"[Workflow] 📊 {file_id}: {stage} ({progress}%)")

    async def complete_workflow(self, file_id: str, result: Dict):
        """Mark workflow as completed"""
        if file_id in self.active_workflows:
            self.active_workflows[file_id].update({
                "stage": "complete",
                "progress": 100,
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "result": result
            })

            await self.publish_update(file_id, "complete", 100, "completed")
            print(f"[Workflow] ✅ Completed workflow for {file_id}")

    async def fail_workflow(self, file_id: str, error: str):
        """Mark workflow as failed"""
        if file_id in self.active_workflows:
            self.active_workflows[file_id].update({
                "status": "failed",
                "error": error,
                "failed_at": datetime.utcnow().isoformat()
            })

            await self.publish_update(file_id, self.active_workflows[file_id]["stage"],
                                     self.active_workflows[file_id]["progress"], "failed")
            print(f"[Workflow] ❌ Failed workflow for {file_id}: {error}")

    async def publish_update(
        self,
        file_id: str,
        stage: str,
        progress: int,
        status: str
    ):
        """Publish workflow update to Redis channel"""
        event = {
            "file_id": file_id,
            "stage": stage,
            "progress": progress,
            "status": status,
            "timestamp": datetime.utcnow().isoformat()
        }

        # Publish to workflow channel
        publish_workflow_event("workflow_updates", event)

        # Also cache the latest update
        from cache import cache_ws_update
        cache_ws_update(file_id, event)

    def get_workflow_status(self, file_id: str) -> Optional[Dict]:
        """Get current workflow status"""
        return self.active_workflows.get(file_id)

    def list_active_workflows(self) -> list:
        """List all active workflows"""
        return list(self.active_workflows.values())


# Singleton instance
workflow_orchestrator = WorkflowOrchestrator()


# Evidence processing pipeline function
async def process_evidence_workflow(
    file_id: str,
    user_id: str,
    filename: str,
    file_path: str
):
    """
    Complete evidence processing pipeline

    Workflow stages:
    1. Upload (10%) - File saved to MinIO
    2. OCR (30%) - Text extraction (if needed)
    3. Embedding (50%) - Generate vector embedding
    4. Analysis (70%) - AI analysis with streaming
    5. Storage (90%) - Store in PGVector + Qdrant
    6. Complete (100%) - Finished
    """
    from storage import upload_file
    from ai_inference import generate_embedding, ai_stream_with_fallback
    from db import store_embedding_dual
    from cache import cache_analysis

    try:
        # Start workflow
        await workflow_orchestrator.start_workflow(file_id, user_id, filename)

        # Stage 1: Upload to MinIO (10%)
        await workflow_orchestrator.update_stage(file_id, "upload", 10)
        object_name = f"{user_id}/{file_id}-{filename}"
        upload_result = upload_file(file_path, object_name, metadata={
            "user_id": user_id,
            "file_id": file_id
        })

        if not upload_result.get("success"):
            raise Exception(f"Upload failed: {upload_result.get('error')}")

        # Stage 2: OCR/Text extraction (30%)
        await workflow_orchestrator.update_stage(file_id, "ocr", 30)
        # TODO: Implement OCR for PDFs/images
        extracted_text = f"Sample text content from {filename}"
        await asyncio.sleep(0.5)  # Simulate processing

        # Stage 3: Generate embedding (50%)
        await workflow_orchestrator.update_stage(file_id, "embedding", 50)
        embedding = await generate_embedding(extracted_text)

        # Stage 4: AI analysis with streaming (70%)
        await workflow_orchestrator.update_stage(file_id, "analysis", 70)

        summary = ""
        auto_tags = []

        async for chunk in ai_stream_with_fallback(
            prompt=f"Analyze this legal document: {filename}. Extract key points and suggest relevant tags.",
            system_prompt="You are a legal AI assistant. Analyze documents and suggest hashtags for categorization.",
            temperature=0.5,
            max_tokens=1024
        ):
            summary += chunk["token"]

            # Extract tags during streaming
            import re
            tag_matches = re.findall(r'#(\w+)', summary)
            if tag_matches:
                auto_tags.extend(tag_matches)

            # Publish token update
            await workflow_orchestrator.publish_update(file_id, "analysis", 70, "processing")

        auto_tags = list(set(auto_tags))  # Remove duplicates

        # Stage 5: Store vectors (90%)
        await workflow_orchestrator.update_stage(file_id, "storage", 90)

        metadata = {
            "filename": filename,
            "tags": auto_tags,
            "summary": summary[:500],  # Truncate for metadata
            "uploaded_at": datetime.utcnow().isoformat()
        }

        await store_embedding_dual(file_id, user_id, embedding, metadata)

        # Cache analysis result
        analysis_result = {
            "file_id": file_id,
            "summary": summary,
            "auto_tags": auto_tags,
            "embedding_dims": len(embedding),
            "processing_time_ms": 0  # TODO: Calculate actual time
        }
        cache_analysis(file_id, analysis_result)

        # Stage 6: Complete (100%)
        await workflow_orchestrator.complete_workflow(file_id, analysis_result)

        return analysis_result

    except Exception as e:
        await workflow_orchestrator.fail_workflow(file_id, str(e))
        raise


# Background task to clean up old workflows
async def cleanup_old_workflows(max_age_hours: int = 24):
    """Clean up workflows older than max_age_hours"""
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)

    for file_id, workflow in list(workflow_orchestrator.active_workflows.items()):
        if workflow.get("status") in ["completed", "failed"]:
            started_at = datetime.fromisoformat(workflow["started_at"])
            if started_at < cutoff:
                del workflow_orchestrator.active_workflows[file_id]
                print(f"[Workflow] 🧹 Cleaned up old workflow: {file_id}")
