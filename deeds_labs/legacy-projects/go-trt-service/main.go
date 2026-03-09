package main

import (
"context"
"encoding/json"
"fmt"
"log"
"net/http"
"os"
"os/exec"
"strconv"
"strings"
"sync"
"time"

"github.com/gorilla/mux"
"github.com/gorilla/websocket"
)

// TensorRTLLMService manages the TensorRT-LLM inference
type TensorRTLLMService struct {
pythonPath    string
modelPath     string
maxBatchSize  int
maxSeqLen     int
port          int
server        *http.Server
upgrader      websocket.Upgrader
requestQueue  chan *InferenceRequest
responseMap   sync.Map
}

// InferenceRequest represents a single inference request
type InferenceRequest struct {
ID          string                 `json:"id"`
Prompt      string                 `json:"prompt"`
MaxTokens   int                    `json:"max_tokens"`
Temperature float64                `json:"temperature"`
TopP        float64                `json:"top_p"`
Stream      bool                   `json:"stream"`
ResponseChan chan *InferenceResponse `json:"-"`
}

// InferenceResponse represents the response from inference
type InferenceResponse struct {
ID      string `json:"id"`
Text    string `json:"text"`
Done    bool   `json:"done"`
Error   string `json:"error,omitempty"`
Tokens  int    `json:"tokens,omitempty"`
TimeMS  int64  `json:"time_ms,omitempty"`
}

func NewTensorRTLLMService(pythonPath, modelPath string, maxBatchSize, maxSeqLen, port int) *TensorRTLLMService {
return &TensorRTLLMService{
pythonPath:   pythonPath,
modelPath:    modelPath,
maxBatchSize: maxBatchSize,
maxSeqLen:    maxSeqLen,
port:         port,
upgrader: websocket.Upgrader{
CheckOrigin: func(r *http.Request) bool {
return true // Allow all origins for development
},
},
requestQueue: make(chan *InferenceRequest, 100),
}
}

func (s *TensorRTLLMService) Start() error {
// Start the inference worker
go s.inferenceWorker()

// Setup HTTP routes
r := mux.NewRouter()
r.HandleFunc("/health", s.healthHandler).Methods("GET")
r.HandleFunc("/generate", s.generateHandler).Methods("POST")
r.HandleFunc("/generate/stream", s.generateStreamHandler).Methods("POST")

s.server = &http.Server{
Addr:    fmt.Sprintf(":%d", s.port),
Handler: r,
}

log.Printf("Starting TensorRT-LLM service on port %d", s.port)
return s.server.ListenAndServe()
}

func (s *TensorRTLLMService) Stop(ctx context.Context) error {
return s.server.Shutdown(ctx)
}

func (s *TensorRTLLMService) healthHandler(w http.ResponseWriter, r *http.Request) {
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"status":       "healthy",
"model_loaded": true,
"batch_size":   s.maxBatchSize,
"seq_len":      s.maxSeqLen,
})
}

func (s *TensorRTLLMService) generateHandler(w http.ResponseWriter, r *http.Request) {
var req InferenceRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
http.Error(w, err.Error(), http.StatusBadRequest)
return
}

req.ID = fmt.Sprintf("req_%d", time.Now().UnixNano())
req.ResponseChan = make(chan *InferenceResponse, 1)

// Send to inference worker
select {
case s.requestQueue <- &req:
// Wait for response
select {
case resp := <-req.ResponseChan:
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
case <-time.After(30 * time.Second):
http.Error(w, "inference timeout", http.StatusRequestTimeout)
}
default:
http.Error(w, "service busy", http.StatusServiceUnavailable)
}
}

func (s *TensorRTLLMService) generateStreamHandler(w http.ResponseWriter, r *http.Request) {
conn, err := s.upgrader.Upgrade(w, r, nil)
if err != nil {
log.Printf("WebSocket upgrade failed: %v", err)
return
}
defer conn.Close()

var req InferenceRequest
if err := conn.ReadJSON(&req); err != nil {
conn.WriteJSON(map[string]string{"error": err.Error()})
return
}

req.ID = fmt.Sprintf("stream_%d", time.Now().UnixNano())
req.Stream = true
req.ResponseChan = make(chan *InferenceResponse, 10)

// Send to inference worker
select {
case s.requestQueue <- &req:
// Stream responses
for {
select {
case resp := <-req.ResponseChan:
if err := conn.WriteJSON(resp); err != nil {
log.Printf("WebSocket write failed: %v", err)
return
}
if resp.Done {
return
}
case <-time.After(60 * time.Second):
conn.WriteJSON(map[string]string{"error": "stream timeout"})
return
}
}
default:
conn.WriteJSON(map[string]string{"error": "service busy"})
}
}

func (s *TensorRTLLMService) inferenceWorker() {
for req := range s.requestQueue {
startTime := time.Now()

// Call Python inference script
result, err := s.callPythonInference(req)

response := &InferenceResponse{
ID:     req.ID,
TimeMS: time.Since(startTime).Milliseconds(),
}

if err != nil {
response.Error = err.Error()
response.Done = true
} else {
response.Text = result
response.Done = !req.Stream
response.Tokens = len(strings.Fields(result))
}

select {
case req.ResponseChan <- response:
default:
log.Printf("Response channel full for request %s", req.ID)
}

// For streaming, send token-by-token
if req.Stream && err == nil {
// Simulate streaming by sending chunks
words := strings.Fields(result)
for i, word := range words {
streamResp := &InferenceResponse{
ID:     req.ID,
Text:   word + " ",
Done:   i == len(words)-1,
Tokens: 1,
TimeMS: time.Since(startTime).Milliseconds(),
}

select {
case req.ResponseChan <- streamResp:
case <-time.After(1 * time.Second):
log.Printf("Stream response timeout for request %s", req.ID)
return
}

// Small delay to simulate real streaming
time.Sleep(50 * time.Millisecond)
}
}
}
}

func (s *TensorRTLLMService) callPythonInference(req *InferenceRequest) (string, error) {
// Prepare command arguments
args := []string{
s.pythonPath,
"/workspace/trt_server/server_sse.py",
"--prompt", req.Prompt,
"--max-tokens", strconv.Itoa(req.MaxTokens),
"--temperature", fmt.Sprintf("%.2f", req.Temperature),
"--top-p", fmt.Sprintf("%.2f", req.TopP),
}

cmd := exec.Command(args[0], args[1:]...)
cmd.Env = append(os.Environ(),
"PYTHONPATH=/workspace/trt_server",
fmt.Sprintf("CUDA_VISIBLE_DEVICES=%s", os.Getenv("CUDA_VISIBLE_DEVICES")),
)

output, err := cmd.CombinedOutput()
if err != nil {
return "", fmt.Errorf("inference failed: %v, output: %s", err, string(output))
}

// Parse the output (assuming JSON format)
var result map[string]interface{}
if err := json.Unmarshal(output, &result); err != nil {
// If not JSON, treat as plain text
return strings.TrimSpace(string(output)), nil
}

if text, ok := result["text"].(string); ok {
return text, nil
}

return "", fmt.Errorf("invalid response format")
}

func main() {
pythonPath := os.Getenv("PYTHON_PATH")
if pythonPath == "" {
pythonPath = "python3"
}

modelPath := os.Getenv("MODEL_PATH")
if modelPath == "" {
modelPath = "/workspace/models/gemma3-4b-it"
}

maxBatchSize := 8
if bs := os.Getenv("MAX_BATCH_SIZE"); bs != "" {
if val, err := strconv.Atoi(bs); err == nil {
maxBatchSize = val
}
}

maxSeqLen := 2048
if sl := os.Getenv("MAX_SEQ_LEN"); sl != "" {
if val, err := strconv.Atoi(sl); err == nil {
maxSeqLen = val
}
}

port := 8090
if p := os.Getenv("PORT"); p != "" {
if val, err := strconv.Atoi(p); err == nil {
port = val
}
}

service := NewTensorRTLLMService(pythonPath, modelPath, maxBatchSize, maxSeqLen, port)

// Handle graceful shutdown
go func() {
sigChan := make(chan os.Signal, 1)
// signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
<-sigChan

log.Println("Shutting down server...")
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

if err := service.Stop(ctx); err != nil {
log.Printf("Server shutdown error: %v", err)
}
}()

log.Fatal(service.Start())
}
