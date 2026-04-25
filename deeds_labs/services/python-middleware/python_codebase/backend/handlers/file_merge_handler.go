package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	_ "github.com/lib/pq"
)

// FileMetadata represents file metadata in the system
type FileMetadata struct {
	ID          string                 `json:"id" db:"id"`
	Filename    string                 `json:"filename" db:"filename"`
	OriginalPath string                `json:"originalPath" db:"original_path"`
	Size        int64                  `json:"size" db:"size"`
	MimeType    string                 `json:"mimeType" db:"mime_type"`
	Checksum    string                 `json:"checksum" db:"checksum"`
	UploadedAt  time.Time              `json:"uploadedAt" db:"uploaded_at"`
	Tags        map[string]interface{} `json:"tags" db:"tags"`
	CaseID      *string                `json:"caseId" db:"case_id"`
	UserID      string                 `json:"userId" db:"user_id"`
	Embedding   []float64              `json:"embedding,omitempty" db:"embedding"`
	VectorID    *string                `json:"vectorId,omitempty" db:"vector_id"`
}

// MergeOperation represents a file merge operation
type MergeOperation struct {
	ID             string    `json:"id" db:"id"`
	SourceFiles    []string  `json:"sourceFiles" db:"source_files"`
	TargetFilename string    `json:"targetFilename" db:"target_filename"`
	MergeType      string    `json:"mergeType" db:"merge_type"`
	Status         string    `json:"status" db:"status"`
	Progress       int       `json:"progress" db:"progress"`
	UserID         string    `json:"userId" db:"user_id"`
	CaseID         *string   `json:"caseId" db:"case_id"`
	ResultFileID   *string   `json:"resultFileId" db:"result_file_id"`
	ErrorMessage   *string   `json:"errorMessage" db:"error_message"`
	CreatedAt      time.Time `json:"createdAt" db:"created_at"`
	CompletedAt    *time.Time `json:"completedAt" db:"completed_at"`
}

// FileMergeHandler handles file merge operations
type FileMergeHandler struct {
	db          *sql.DB
	minioClient *minio.Client
	bucket      string
}

// NewFileMergeHandler creates a new file merge handler
func NewFileMergeHandler(db *sql.DB, minioEndpoint, accessKey, secretKey, bucket string) (*FileMergeHandler, error) {
	// Initialize MinIO client
	minioClient, err := minio.New(minioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false, // Set to true for HTTPS
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize MinIO client: %v", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := minioClient.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket existence: %v", err)
	}
	if !exists {
		err = minioClient.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %v", err)
		}
	}

	return &FileMergeHandler{
		db:          db,
		minioClient: minioClient,
		bucket:      bucket,
	}, nil
}

// UploadFile handles file uploads
func (h *FileMergeHandler) UploadFile(c *gin.Context) {
	// Parse multipart form
	err := c.Request.ParseMultipartForm(100 << 20) // 100MB max
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Get additional metadata
	userID := c.PostForm("userId")
	caseID := c.PostForm("caseId")
	tagsJSON := c.PostForm("tags")

	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userId is required"})
		return
	}

	// Parse tags
	var tags map[string]interface{}
	if tagsJSON != "" {
		err = json.Unmarshal([]byte(tagsJSON), &tags)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid tags JSON"})
			return
		}
	}
	if tags == nil {
		tags = make(map[string]interface{})
	}

	// Generate file ID and read file content
	fileID := generateFileID()
	fileContent, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Calculate checksum
	hash := sha256.Sum256(fileContent)
	checksum := hex.EncodeToString(hash[:])

	// Generate MinIO filename
	filename := fmt.Sprintf("%s_%s", fileID, header.Filename)

	// Upload to MinIO
	ctx := context.Background()
	_, err = h.minioClient.PutObject(ctx, h.bucket, filename, bytes.NewReader(fileContent), int64(len(fileContent)), minio.PutObjectOptions{
		ContentType: header.Header.Get("Content-Type"),
		UserMetadata: map[string]string{
			"X-File-Checksum": checksum,
			"X-Upload-Time":   time.Now().Format(time.RFC3339),
			"X-User-ID":       userID,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file to storage"})
		return
	}

	// Create file metadata
	metadata := FileMetadata{
		ID:           fileID,
		Filename:     filename,
		OriginalPath: header.Filename,
		Size:         int64(len(fileContent)),
		MimeType:     header.Header.Get("Content-Type"),
		Checksum:     checksum,
		UploadedAt:   time.Now(),
		Tags:         tags,
		UserID:       userID,
	}

	if caseID != "" {
		metadata.CaseID = &caseID
	}

	// Save metadata to database
	err = h.saveFileMetadata(&metadata)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save metadata"})
		return
	}

	// Generate embeddings for text files (async)
	go h.processEmbeddings(&metadata, fileContent)

	c.JSON(http.StatusOK, metadata)
}

// MergeFiles handles file merging operations
func (h *FileMergeHandler) MergeFiles(c *gin.Context) {
	var request struct {
		SourceFiles    []string               `json:"sourceFiles" binding:"required"`
		TargetFilename string                 `json:"targetFilename" binding:"required"`
		MergeType      string                 `json:"mergeType" binding:"required"`
		UserID         string                 `json:"userId" binding:"required"`
		CaseID         *string                `json:"caseId"`
		Tags           map[string]interface{} `json:"tags"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate merge type
	validMergeTypes := []string{"concatenate", "overlay", "archive", "legal-discovery"}
	isValidType := false
	for _, validType := range validMergeTypes {
		if request.MergeType == validType {
			isValidType = true
			break
		}
	}
	if !isValidType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid merge type"})
		return
	}

	// Create merge operation
	operationID := generateFileID()
	operation := MergeOperation{
		ID:             operationID,
		SourceFiles:    request.SourceFiles,
		TargetFilename: request.TargetFilename,
		MergeType:      request.MergeType,
		Status:         "pending",
		Progress:       0,
		UserID:         request.UserID,
		CaseID:         request.CaseID,
		CreatedAt:      time.Now(),
	}

	// Save operation to database
	err := h.saveMergeOperation(&operation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create merge operation"})
		return
	}

	// Process merge operation asynchronously
	go h.processMergeOperation(&operation, request.Tags)

	c.JSON(http.StatusAccepted, operation)
}

// GetFiles retrieves file list with optional filtering
func (h *FileMergeHandler) GetFiles(c *gin.Context) {
	userID := c.Query("userId")
	caseID := c.Query("caseId")
	limit := c.DefaultQuery("limit", "50")
	offset := c.DefaultQuery("offset", "0")

	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userId parameter is required"})
		return
	}

	query := `
		SELECT id, filename, original_path, size, mime_type, checksum, 
		       uploaded_at, tags, case_id, user_id, vector_id
		FROM file_metadata 
		WHERE user_id = $1
	`
	args := []interface{}{userID}
	argIndex := 2

	if caseID != "" {
		query += fmt.Sprintf(" AND case_id = $%d", argIndex)
		args = append(args, caseID)
		argIndex++
	}

	query += fmt.Sprintf(" ORDER BY uploaded_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database query failed"})
		return
	}
	defer rows.Close()

	var files []FileMetadata
	for rows.Next() {
		var file FileMetadata
		var tagsJSON []byte

		err := rows.Scan(
			&file.ID, &file.Filename, &file.OriginalPath, &file.Size,
			&file.MimeType, &file.Checksum, &file.UploadedAt,
			&tagsJSON, &file.CaseID, &file.UserID, &file.VectorID,
		)
		if err != nil {
			continue
		}

		// Parse tags JSON
		if len(tagsJSON) > 0 {
			json.Unmarshal(tagsJSON, &file.Tags)
		}

		files = append(files, file)
	}

	c.JSON(http.StatusOK, gin.H{
		"files": files,
		"total": len(files),
	})
}

// SearchFiles handles similarity search
func (h *FileMergeHandler) SearchFiles(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	userID := c.Query("userId")
	caseID := c.Query("caseId")
	limit := c.DefaultQuery("limit", "10")
	threshold := c.DefaultQuery("threshold", "0.7")

	// Generate embedding for query (this would call your embedding service)
	embedding, err := h.generateEmbedding(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate embedding"})
		return
	}

	// Search in database using pgVector
	searchQuery := `
		SELECT fm.id, fm.filename, fm.original_path, fm.size, fm.mime_type,
		       fm.checksum, fm.uploaded_at, fm.tags, fm.case_id, fm.user_id,
		       1 - (de.embedding <-> $1::vector) as similarity
		FROM file_metadata fm
		JOIN document_embeddings de ON fm.id = de.file_id
		WHERE 1 - (de.embedding <-> $1::vector) > $2
	`
	args := []interface{}{embedding, threshold}
	argIndex := 3

	if userID != "" {
		searchQuery += fmt.Sprintf(" AND fm.user_id = $%d", argIndex)
		args = append(args, userID)
		argIndex++
	}

	if caseID != "" {
		searchQuery += fmt.Sprintf(" AND fm.case_id = $%d", argIndex)
		args = append(args, caseID)
		argIndex++
	}

	searchQuery += fmt.Sprintf(" ORDER BY similarity DESC LIMIT $%d", argIndex)
	args = append(args, limit)

	rows, err := h.db.Query(searchQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search query failed"})
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var file FileMetadata
		var similarity float64
		var tagsJSON []byte

		err := rows.Scan(
			&file.ID, &file.Filename, &file.OriginalPath, &file.Size,
			&file.MimeType, &file.Checksum, &file.UploadedAt,
			&tagsJSON, &file.CaseID, &file.UserID, &similarity,
		)
		if err != nil {
			continue
		}

		// Parse tags JSON
		if len(tagsJSON) > 0 {
			json.Unmarshal(tagsJSON, &file.Tags)
		}

		result := map[string]interface{}{
			"id":           file.ID,
			"filename":     file.Filename,
			"originalPath": file.OriginalPath,
			"size":         file.Size,
			"mimeType":     file.MimeType,
			"checksum":     file.Checksum,
			"uploadedAt":   file.UploadedAt,
			"tags":         file.Tags,
			"caseId":       file.CaseID,
			"userId":       file.UserID,
			"similarity":   similarity,
		}

		results = append(results, result)
	}

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"query":   query,
		"total":   len(results),
	})
}

// DownloadFile handles file downloads
func (h *FileMergeHandler) DownloadFile(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File ID is required"})
		return
	}

	// Get file metadata
	var metadata FileMetadata
	err := h.db.QueryRow(`
		SELECT id, filename, original_path, size, mime_type
		FROM file_metadata WHERE id = $1
	`, fileID).Scan(
		&metadata.ID, &metadata.Filename, &metadata.OriginalPath,
		&metadata.Size, &metadata.MimeType,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Get file from MinIO
	ctx := context.Background()
	object, err := h.minioClient.GetObject(ctx, h.bucket, metadata.Filename, minio.GetObjectOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve file"})
		return
	}
	defer object.Close()

	// Set headers for download
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", metadata.OriginalPath))
	c.Header("Content-Type", metadata.MimeType)
	c.Header("Content-Length", strconv.FormatInt(metadata.Size, 10))

	// Stream file to response
	io.Copy(c.Writer, object)
}

// Helper functions

func generateFileID() string {
	return fmt.Sprintf("file_%d_%s", time.Now().UnixNano(), randomString(8))
}

func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[time.Now().UnixNano()%int64(len(charset))]
	}
	return string(result)
}

func (h *FileMergeHandler) saveFileMetadata(metadata *FileMetadata) error {
	tagsJSON, _ := json.Marshal(metadata.Tags)
	
	_, err := h.db.Exec(`
		INSERT INTO file_metadata (
			id, filename, original_path, size, mime_type, checksum,
			uploaded_at, tags, case_id, user_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, metadata.ID, metadata.Filename, metadata.OriginalPath, metadata.Size,
		metadata.MimeType, metadata.Checksum, metadata.UploadedAt,
		string(tagsJSON), metadata.CaseID, metadata.UserID)
	
	return err
}

func (h *FileMergeHandler) saveMergeOperation(operation *MergeOperation) error {
	sourceFilesJSON, _ := json.Marshal(operation.SourceFiles)
	
	_, err := h.db.Exec(`
		INSERT INTO merge_operations (
			id, source_files, target_filename, merge_type, status,
			progress, user_id, case_id, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, operation.ID, string(sourceFilesJSON), operation.TargetFilename,
		operation.MergeType, operation.Status, operation.Progress,
		operation.UserID, operation.CaseID, operation.CreatedAt)
	
	return err
}

func (h *FileMergeHandler) generateEmbedding(text string) (string, error) {
	// This would call your Ollama service to generate embeddings
	// For now, return a placeholder
	payload := map[string]interface{}{
		"model":  "nomic-embed-text",
		"prompt": text,
	}
	
	payloadBytes, _ := json.Marshal(payload)
	
	resp, err := http.Post("http://localhost:11434/api/embeddings",
		"application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", err
	}
	
	// Convert embedding to PostgreSQL vector format
	embedding := result["embedding"].([]interface{})
	embeddingStr := "["
	for i, val := range embedding {
		if i > 0 {
			embeddingStr += ","
		}
		embeddingStr += fmt.Sprintf("%f", val)
	}
	embeddingStr += "]"
	
	return embeddingStr, nil
}

func (h *FileMergeHandler) processEmbeddings(metadata *FileMetadata, content []byte) {
	// Extract text content based on file type
	var textContent string
	
	if strings.HasPrefix(metadata.MimeType, "text/") {
		textContent = string(content)
	} else if metadata.MimeType == "application/pdf" {
		// You would use a PDF parsing library here
		textContent = "PDF content extraction would go here"
	} else {
		// Skip non-text files
		return
	}
	
	// Generate embedding
	embedding, err := h.generateEmbedding(textContent)
	if err != nil {
		log.Printf("Failed to generate embedding for file %s: %v", metadata.ID, err)
		return
	}
	
	// Store in document_embeddings table
	_, err = h.db.Exec(`
		INSERT INTO document_embeddings (file_id, content, embedding)
		VALUES ($1, $2, $3)
		ON CONFLICT (file_id) DO UPDATE SET
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding
	`, metadata.ID, textContent, embedding)
	
	if err != nil {
		log.Printf("Failed to store embedding for file %s: %v", metadata.ID, err)
	}
}

func (h *FileMergeHandler) processMergeOperation(operation *MergeOperation, tags map[string]interface{}) {
	// Update status to processing
	h.db.Exec("UPDATE merge_operations SET status = 'processing', progress = 10 WHERE id = $1", operation.ID)
	
	// Simulate merge operation (you would implement actual merging logic here)
	time.Sleep(2 * time.Second)
	h.db.Exec("UPDATE merge_operations SET progress = 50 WHERE id = $1", operation.ID)
	
	time.Sleep(2 * time.Second)
	h.db.Exec("UPDATE merge_operations SET progress = 90 WHERE id = $1", operation.ID)
	
	// Complete operation
	completedAt := time.Now()
	h.db.Exec(`
		UPDATE merge_operations 
		SET status = 'completed', progress = 100, completed_at = $1 
		WHERE id = $2
	`, completedAt, operation.ID)
}