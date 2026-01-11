package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
)

type PostgresService struct {
	pool *pgxpool.Pool
	cfg  *config.Config
}

// DBIdentity contains database connection identity for verification
type DBIdentity struct {
	CurrentDatabase string `json:"current_database"`
	CurrentUser     string `json:"current_user"`
	ServerAddr      string `json:"server_addr"`
}

type ErrorRow struct {
	ErrorID      int       `json:"error_id"`
	Code         string    `json:"code"`
	FilePath     string    `json:"file_path"`
	Line         int       `json:"line"`
	Message      string    `json:"message"`
	ImpactScore  float64   `json:"impact_score"`
	Embedding    []float32 `json:"embedding,omitempty"`
	Distance     float32   `json:"distance,omitempty"`
}

func NewPostgresService(ctx context.Context, cfg *config.Config) (*PostgresService, error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	// Test connection
	var dbName, dbUser, dbHost string
	err = pool.QueryRow(ctx, "SELECT current_database(), current_user, COALESCE(inet_server_addr()::text, 'localhost')").Scan(&dbName, &dbUser, &dbHost)
	if err != nil {
		return nil, fmt.Errorf("failed to verify connection: %w", err)
	}

	fmt.Printf("📊 PostgreSQL Identity: %s@%s/%s\n", dbUser, dbHost, dbName)

	return &PostgresService{
		pool: pool,
		cfg:  cfg,
	}, nil
}

func (s *PostgresService) Close() {
	s.pool.Close()
}

// GetDBIdentity returns the database identity for verification (prevents wrong-DB issues)
func (s *PostgresService) GetDBIdentity(ctx context.Context) (*DBIdentity, error) {
	var identity DBIdentity
	query := `SELECT
		current_database() AS current_database,
		current_user AS current_user,
		COALESCE(inet_server_addr()::text, 'localhost') AS server_addr`

	err := s.pool.QueryRow(ctx, query).Scan(
		&identity.CurrentDatabase,
		&identity.CurrentUser,
		&identity.ServerAddr,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get DB identity: %w", err)
	}

	return &identity, nil
}

// GetNextError retrieves the highest-impact open error
func (s *PostgresService) GetNextError(ctx context.Context) (*ErrorRow, error) {
	query := `
		SELECT e.id, e.code, e.file_path, e.line, e.message, e.impact_score, em.embedding
		FROM ts_errors e
		LEFT JOIN error_embeddings em ON e.id = em.error_id
		WHERE e.status = 'open'
		ORDER BY e.impact_score DESC
		LIMIT 1
	`

	var row ErrorRow
	var embedding *pgvector.Vector

	err := s.pool.QueryRow(ctx, query).Scan(
		&row.ErrorID, &row.Code, &row.FilePath, &row.Line,
		&row.Message, &row.ImpactScore, &embedding,
	)
	if err != nil {
		return nil, err
	}

	if embedding != nil {
		row.Embedding = embedding.Slice()
	}

	return &row, nil
}

// FindSimilarErrors uses pgvector HNSW index for cosine similarity search
func (s *PostgresService) FindSimilarErrors(ctx context.Context, queryVector []float32, topK int) ([]ErrorRow, error) {
	query := `
		SELECT e.id, e.error_code, e.file_path, COALESCE(e.line_number, 0), e.error_message, 0.0,
		       (em.embedding <=> $1::vector) AS distance
		FROM error_embeddings em
		JOIN ts_errors e ON e.id = em.error_id
		WHERE e.resolved = false
		ORDER BY em.embedding <=> $1::vector
		LIMIT $2
	`

	vec := pgvector.NewVector(queryVector)
	rows, err := s.pool.Query(ctx, query, vec, topK)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ErrorRow
	for rows.Next() {
		var row ErrorRow
		err := rows.Scan(
			&row.ErrorID, &row.Code, &row.FilePath, &row.Line,
			&row.Message, &row.ImpactScore, &row.Distance,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, row)
	}

	return results, rows.Err()
}

// GetErrorByID retrieves a specific error with its embedding
func (s *PostgresService) GetErrorByID(ctx context.Context, errorID int) (*ErrorRow, error) {
	query := `
		SELECT e.id, e.code, e.file_path, e.line, e.message, e.impact_score, em.embedding
		FROM ts_errors e
		LEFT JOIN error_embeddings em ON e.id = em.error_id
		WHERE e.id = $1
	`

	var row ErrorRow
	var embedding *pgvector.Vector

	err := s.pool.QueryRow(ctx, query, errorID).Scan(
		&row.ErrorID, &row.Code, &row.FilePath, &row.Line,
		&row.Message, &row.ImpactScore, &embedding,
	)
	if err != nil {
		return nil, err
	}

	if embedding != nil {
		row.Embedding = embedding.Slice()
	}

	return &row, nil
}

// UpdateErrorStatus marks an error as fixed or failed
func (s *PostgresService) UpdateErrorStatus(ctx context.Context, errorID int, status string) error {
	query := `
		UPDATE ts_errors
		SET status = $1, updated_at = $2
		WHERE id = $3
	`
	_, err := s.pool.Exec(ctx, query, status, time.Now(), errorID)
	return err
}

// GetErrorCount returns total error count by status
func (s *PostgresService) GetErrorCount(ctx context.Context, status string) (int, error) {
	query := `SELECT COUNT(*) FROM ts_errors WHERE status = $1`

	var count int
	err := s.pool.QueryRow(ctx, query, status).Scan(&count)
	return count, err
}
