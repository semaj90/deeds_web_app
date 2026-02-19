package goquic

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	amqp "github.com/rabbitmq/amqp091-go"
)

type UploadResult struct {
	DocID    string `json:"doc_id"`
	FileName string `json:"filename"`
	Bucket   string `json:"bucket"`
	Size     int64  `json:"size"`
	Path     string `json:"path"`
}

type OCRTask struct {
	DocID     string    `json:"doc_id"`
	FilePath  string    `json:"file_path"`
	Bucket    string    `json:"bucket"`
	FileName  string    `json:"filename"`
	CreatedAt time.Time `json:"created_at"`
}

type LegalAIQuicServer struct {
	minioClient *MinIOClient
	rabbitmqURL string
	mux         *http.ServeMux
}

// MinIOClient wraps MinIO operations
type MinIOClient struct {
	client *minio.Client
	bucket string
}

// NewMinIOClient creates a new MinIO client
func NewMinIOClient(endpoint, accessKey, secretKey, bucket string) (*MinIOClient, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client creation failed: %w", err)
	}

	return &MinIOClient{
		client: client,
		bucket: bucket,
	}, nil
}

// EnsureBucket creates bucket if it doesn't exist
func (m *MinIOClient) EnsureBucket(ctx context.Context) error {
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return fmt.Errorf("bucket exists check failed: %w", err)
	}

	if !exists {
		err = m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("bucket creation failed: %w", err)
		}
	}

	return nil
}

// UploadAndPublish handles file upload to MinIO and publishes OCR task to RabbitMQ
func (s *LegalAIQuicServer) UploadAndPublish(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Parse multipart form (500MB max)
	err := r.ParseMultipartForm(500 << 20)
	if err != nil {
		http.Error(w, fmt.Sprintf("multipart parse error: %v", err), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf("file read error: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Generate stable doc ID from file hash
	h := sha256.New()
	fileSize, err := io.Copy(h, file)
	if err != nil {
		http.Error(w, fmt.Sprintf("hash error: %v", err), http.StatusInternalServerError)
		return
	}

	docHash := hex.EncodeToString(h.Sum(nil))[:16]
	docID := "doc_" + docHash

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	// Upload to MinIO
	objPath := fmt.Sprintf("evidence/%s/file%s", docID, getExt(header.Filename))

	_, err = s.minioClient.client.PutObject(
		ctx,
		s.minioClient.bucket,
		objPath,
		file,
		fileSize,
		minio.PutObjectOptions{
			ContentType: header.Header.Get("Content-Type"),
		},
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("minio upload error: %v", err), http.StatusInternalServerError)
		return
	}

	// Publish OCR task to RabbitMQ
	task := OCRTask{
		DocID:     docID,
		FilePath:  objPath,
		Bucket:    s.minioClient.bucket,
		FileName:  header.Filename,
		CreatedAt: time.Now(),
	}

	taskJSON, _ := json.Marshal(task)

	err = s.publishToRabbitMQ("ingest", taskJSON)
	if err != nil {
		http.Error(w, fmt.Sprintf("rabbitmq publish error: %v", err), http.StatusInternalServerError)
		return
	}

	// Return result
	result := UploadResult{
		DocID:    docID,
		FileName: header.Filename,
		Bucket:   s.minioClient.bucket,
		Size:     fileSize,
		Path:     objPath,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// publishToRabbitMQ publishes a message to RabbitMQ
func (s *LegalAIQuicServer) publishToRabbitMQ(queueName string, body []byte) error {
	conn, err := amqp.Dial(s.rabbitmqURL)
	if err != nil {
		return fmt.Errorf("rabbitmq connection failed: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("channel creation failed: %w", err)
	}
	defer ch.Close()

	// Declare queue
	_, err = ch.QueueDeclare(
		queueName, // name
		true,      // durable
		false,     // auto-delete
		false,     // exclusive
		false,     // no-wait
		nil,       // arguments
	)
	if err != nil {
		return fmt.Errorf("queue declare failed: %w", err)
	}

	// Publish message
	err = ch.Publish(
		"",        // exchange
		queueName, // routing key
		false,     // mandatory
		false,     // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		return fmt.Errorf("publish failed: %w", err)
	}

	return nil
}

// getExt extracts file extension
func getExt(filename string) string {
	i := strings.LastIndex(filename, ".")
	if i < 0 {
		return ""
	}
	return filename[i:]
}

// RegisterUploadHandler registers the upload endpoint
func (s *LegalAIQuicServer) RegisterUploadHandler() {
	s.mux.HandleFunc("/api/evidence/upload", s.UploadAndPublish)
}
