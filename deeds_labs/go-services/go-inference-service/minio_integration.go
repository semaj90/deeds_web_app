package main

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

// MinIO Configuration
const (
	MinIOEndpoint   = "localhost:9000"
	MinIOAccessKey  = "minio"
	MinIOSecretKey  = "minio123"
	MinIOBucketName = "legal-documents"
)

// MinIOService handles document storage and retrieval
type MinIOService struct {
	client *minio.Client
	logger *zap.Logger
}

// NewMinIOService creates a new MinIO service
func NewMinIOService(logger *zap.Logger) (*MinIOService, error) {
	client, err := minio.New(MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(MinIOAccessKey, MinIOSecretKey, ""),
		Secure: false, // Use HTTPS in production
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}
	
	service := &MinIOService{
		client: client,
		logger: logger,
	}
	
	// Initialize bucket
	if err := service.initializeBucket(); err != nil {
		return nil, fmt.Errorf("failed to initialize bucket: %w", err)
	}
	
	return service, nil
}

// initializeBucket ensures the bucket exists
func (m *MinIOService) initializeBucket() error {
	ctx := context.Background()
	
	exists, err := m.client.BucketExists(ctx, MinIOBucketName)
	if err != nil {
		return err
	}
	
	if !exists {
		if err := m.client.MakeBucket(ctx, MinIOBucketName, minio.MakeBucketOptions{}); err != nil {
			return err
		}
		m.logger.Info("Created MinIO bucket", zap.String("bucket", MinIOBucketName))
	}
	
	return nil
}

// UploadDocument uploads a document to MinIO
func (m *MinIOService) UploadDocument(ctx context.Context, filename string, content io.Reader, size int64, contentType string) (string, error) {
	// Generate unique path
	timestamp := time.Now().Format("2006/01/02")
	objectPath := fmt.Sprintf("%s/%s_%d_%s", 
		timestamp, 
		strings.ReplaceAll(filename, " ", "_"),
		time.Now().Unix(),
		filename)
	
	_, err := m.client.PutObject(ctx, MinIOBucketName, objectPath, content, size, 
		minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return "", err
	}
	
	m.logger.Info("Document uploaded to MinIO",
		zap.String("path", objectPath),
		zap.Int64("size", size))
	
	return objectPath, nil
}

// GetDocument retrieves a document from MinIO
func (m *MinIOService) GetDocument(ctx context.Context, objectPath string) (io.ReadCloser, error) {
	return m.client.GetObject(ctx, MinIOBucketName, objectPath, minio.GetObjectOptions{})
}

// StreamDocument streams a document from MinIO
func (m *MinIOService) StreamDocument(ctx context.Context, objectPath string, w io.Writer) error {
	object, err := m.client.GetObject(ctx, MinIOBucketName, objectPath, minio.GetObjectOptions{})
	if err != nil {
		return err
	}
	defer object.Close()
	
	_, err = io.Copy(w, object)
	return err
}

// DeleteDocument removes a document from MinIO
func (m *MinIOService) DeleteDocument(ctx context.Context, objectPath string) error {
	return m.client.RemoveObject(ctx, MinIOBucketName, objectPath, minio.RemoveObjectOptions{})
}

// ListDocuments lists documents with pagination
func (m *MinIOService) ListDocuments(ctx context.Context, prefix string, recursive bool) ([]minio.ObjectInfo, error) {
	var objects []minio.ObjectInfo
	
	for object := range m.client.ListObjects(ctx, MinIOBucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: recursive,
	}) {
		if object.Err != nil {
			return nil, object.Err
		}
		objects = append(objects, object)
	}
	
	return objects, nil
}

// HTTP handlers for MinIO operations

// uploadHandler handles document uploads
func (s *InferenceService) uploadHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("document")
	if err != nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Failed to get file: %v", err),
		})
		return
	}
	defer file.Close()
	
	if s.minioService == nil {
		c.JSON(500, gin.H{
			"success": false,
			"error":   "MinIO service not available",
		})
		return
	}
	
	// Upload to MinIO
	objectPath, err := s.minioService.UploadDocument(
		context.Background(),
		header.Filename,
		file,
		header.Size,
		header.Header.Get("Content-Type"),
	)
	if err != nil {
		s.logger.Error("MinIO upload failed", zap.Error(err))
		c.JSON(500, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Upload failed: %v", err),
		})
		return
	}
	
	// Store document metadata in database
	docID, err := s.storeDocumentMetadata(context.Background(), &DocumentMetadata{
		Filename:    header.Filename,
		ObjectPath:  objectPath,
		Size:        header.Size,
		ContentType: header.Header.Get("Content-Type"),
		UploadedAt:  time.Now(),
	})
	if err != nil {
		s.logger.Error("Failed to store document metadata", zap.Error(err))
		// Continue - document is uploaded, just metadata storage failed
	}
	
	c.JSON(200, gin.H{
		"success":     true,
		"document_id": docID,
		"object_path": objectPath,
		"file_size":   header.Size,
		"message":     "Document uploaded successfully",
	})
}

// downloadHandler streams documents from MinIO
func (s *InferenceService) downloadHandler(c *gin.Context) {
	objectPath := c.Param("path")
	if objectPath == "" {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "Object path required",
		})
		return
	}
	
	if s.minioService == nil {
		c.JSON(500, gin.H{
			"success": false,
			"error":   "MinIO service not available",
		})
		return
	}
	
	// Stream document from MinIO
	err := s.minioService.StreamDocument(context.Background(), objectPath, c.Writer)
	if err != nil {
		s.logger.Error("MinIO download failed", zap.Error(err))
		c.JSON(500, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Download failed: %v", err),
		})
		return
	}
}

// listDocumentsHandler lists documents in MinIO
func (s *InferenceService) listDocumentsHandler(c *gin.Context) {
	prefix := c.Query("prefix")
	
	if s.minioService == nil {
		c.JSON(500, gin.H{
			"success": false,
			"error":   "MinIO service not available",
		})
		return
	}
	
	objects, err := s.minioService.ListDocuments(context.Background(), prefix, true)
	if err != nil {
		c.JSON(500, gin.H{
			"success": false,
			"error":   fmt.Sprintf("List failed: %v", err),
		})
		return
	}
	
	c.JSON(200, gin.H{
		"success": true,
		"objects": objects,
		"count":   len(objects),
	})
}

// DocumentMetadata represents document metadata stored in PostgreSQL
type DocumentMetadata struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	ObjectPath  string    `json:"object_path"`
	Size        int64     `json:"size"`
	ContentType string    `json:"content_type"`
	UploadedAt  time.Time `json:"uploaded_at"`
	ProcessedAt *time.Time `json:"processed_at,omitempty"`
}

// storeDocumentMetadata stores document metadata in PostgreSQL
func (s *InferenceService) storeDocumentMetadata(ctx context.Context, doc *DocumentMetadata) (string, error) {
	query := `
		INSERT INTO document_metadata (filename, object_path, size, content_type, uploaded_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	
	var id string
	err := s.db.QueryRow(ctx, query, doc.Filename, doc.ObjectPath, doc.Size, doc.ContentType, doc.UploadedAt).Scan(&id)
	return id, err
}