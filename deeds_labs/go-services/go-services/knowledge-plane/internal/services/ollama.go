package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
)

type OllamaService struct {
	cfg    *config.Config
	client *http.Client
}

type EmbeddingRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

type ChatRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type ChatResponse struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

func NewOllamaService(cfg *config.Config) *OllamaService {
	return &OllamaService{
		cfg: cfg,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// GenerateEmbedding calls Ollama embeddings API
func (s *OllamaService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	req := EmbeddingRequest{
		Model:  s.cfg.OllamaEmbedModel,
		Prompt: text,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		"POST",
		fmt.Sprintf("%s/api/embeddings", s.cfg.OllamaURL),
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Ollama API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var embResp EmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&embResp); err != nil {
		return nil, err
	}

	return embResp.Embedding, nil
}

// GenerateChat calls Ollama chat/generate API (non-streaming)
func (s *OllamaService) GenerateChat(ctx context.Context, prompt string) (string, error) {
	req := ChatRequest{
		Model:  s.cfg.OllamaChatModel,
		Prompt: prompt,
		Stream: false,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		"POST",
		fmt.Sprintf("%s/api/generate", s.cfg.OllamaURL),
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResp ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return "", err
	}

	return chatResp.Response, nil
}

// StreamChat calls Ollama generate API with streaming (returns channel)
func (s *OllamaService) StreamChat(ctx context.Context, prompt string) (<-chan ChatResponse, <-chan error) {
	respChan := make(chan ChatResponse)
	errChan := make(chan error, 1)

	go func() {
		defer close(respChan)
		defer close(errChan)

		req := ChatRequest{
			Model:  s.cfg.OllamaChatModel,
			Prompt: prompt,
			Stream: true,
		}

		body, err := json.Marshal(req)
		if err != nil {
			errChan <- err
			return
		}

		httpReq, err := http.NewRequestWithContext(
			ctx,
			"POST",
			fmt.Sprintf("%s/api/generate", s.cfg.OllamaURL),
			bytes.NewReader(body),
		)
		if err != nil {
			errChan <- err
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := s.client.Do(httpReq)
		if err != nil {
			errChan <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			errChan <- fmt.Errorf("Ollama API error %d: %s", resp.StatusCode, string(bodyBytes))
			return
		}

		decoder := json.NewDecoder(resp.Body)
		for {
			var chunk ChatResponse
			if err := decoder.Decode(&chunk); err != nil {
				if err != io.EOF {
					errChan <- err
				}
				return
			}

			select {
			case respChan <- chunk:
			case <-ctx.Done():
				errChan <- ctx.Err()
				return
			}

			if chunk.Done {
				return
			}
		}
	}()

	return respChan, errChan
}
