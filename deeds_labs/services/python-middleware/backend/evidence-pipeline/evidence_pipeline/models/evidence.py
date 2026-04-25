"""Evidence document models."""

from sqlalchemy import Column, String, Integer, DateTime, Text, LargeBinary, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from datetime import datetime
import uuid
import enum

from evidence_pipeline.database import Base


class DocumentType(str, enum.Enum):
    """Document type enumeration."""
    PDF = "pdf"
    IMAGE = "image"
    SCANNED = "scanned"
    MIXED = "mixed"


class ProcessingStage(str, enum.Enum):
    """Processing stage enumeration."""
    CLASSIFICATION = "classification"
    OCR = "ocr"
    PARSING = "parsing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    ANALYSIS = "analysis"
    COMPLETE = "complete"


class ProcessingStatus(str, enum.Enum):
    """Processing status enumeration."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class EvidenceDocument(Base):
    """Evidence document metadata."""
    __tablename__ = "evidence_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(String(255), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(Enum(DocumentType), nullable=False)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.QUEUED, index=True)
    file_size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EvidenceChunk(Base):
    """Evidence text chunk."""
    __tablename__ = "evidence_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("evidence_documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    embedding = Column(ARRAY(Float), nullable=True)
    source_section = Column(String(255), nullable=True)
    page_number = Column(Integer, nullable=True)
    position_in_document = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class EvidenceProcessingJob(Base):
    """Evidence processing job tracking."""
    __tablename__ = "evidence_processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("evidence_documents.id"), nullable=False, index=True)
    stage = Column(Enum(ProcessingStage), nullable=False, index=True)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.QUEUED, index=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
