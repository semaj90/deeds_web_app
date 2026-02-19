package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOClient handles document storage and retrieval
type MinIOClient struct {
	client     *minio.Client
	bucketName string
}

// NewMinIOClient creates a new MinIO client
func NewMinIOClient() (*MinIOClient, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}

	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}

	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "minioadmin"
	}

	bucketName := os.Getenv("MINIO_BUCKET")
	if bucketName == "" {
		bucketName = "legal-documents"
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false, // Use true for HTTPS
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucketName)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}

	if !exists {
		err = client.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
		log.Printf("✅ Created MinIO bucket: %s", bucketName)
	}

	return &MinIOClient{
		client:     client,
		bucketName: bucketName,
	}, nil
}

// StoreDocument stores a document in MinIO
func (m *MinIOClient) StoreDocument(ctx context.Context, objectName string, reader io.Reader, size int64) error {
	_, err := m.client.PutObject(ctx, m.bucketName, objectName, reader, size, minio.PutObjectOptions{
		ContentType: "application/json",
	})
	if err != nil {
		return fmt.Errorf("failed to store document: %w", err)
	}

	log.Printf("📦 Stored document: %s (%d bytes)", objectName, size)
	return nil
}

// GetDocument retrieves a document from MinIO
func (m *MinIOClient) GetDocument(ctx context.Context, objectName string) ([]byte, error) {
	object, err := m.client.GetObject(ctx, m.bucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get document: %w", err)
	}
	defer object.Close()

	data, err := io.ReadAll(object)
	if err != nil {
		return nil, fmt.Errorf("failed to read document: %w", err)
	}

	return data, nil
}

// ListDocuments lists all documents in the bucket
func (m *MinIOClient) ListDocuments(ctx context.Context, prefix string) ([]string, error) {
	var documents []string

	objectCh := m.client.ListObjects(ctx, m.bucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	for object := range objectCh {
		if object.Err != nil {
			return nil, fmt.Errorf("error listing objects: %w", object.Err)
		}
		documents = append(documents, object.Key)
	}

	return documents, nil
}

// GetDocumentMetadata retrieves metadata for a document
func (m *MinIOClient) GetDocumentMetadata(ctx context.Context, objectName string) (map[string]interface{}, error) {
	stat, err := m.client.StatObject(ctx, m.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get metadata: %w", err)
	}

	metadata := map[string]interface{}{
		"key":          stat.Key,
		"size":         stat.Size,
		"content_type": stat.ContentType,
		"last_modified": stat.LastModified.Format(time.RFC3339),
		"etag":         stat.ETag,
	}

	return metadata, nil
}
