package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// AuthServer implements the Authentication service
type AuthServer struct {
	port          string
	sessions      map[string]*SessionInfo
	users         map[string]*UserInfo
	refreshTokens map[string]*RefreshTokenInfo
}

// SessionInfo represents active user sessions
type SessionInfo struct {
	UserID    string    `json:"user_id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
}

// UserInfo represents user account information
type UserInfo struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"password_hash"`
	Role         string    `json:"role"`
	Permissions  []string  `json:"permissions"`
	CreatedAt    time.Time `json:"created_at"`
	LastLogin    time.Time `json:"last_login"`
	Active       bool      `json:"active"`
}

// RefreshTokenInfo represents refresh token data
type RefreshTokenInfo struct {
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Used      bool      `json:"used"`
}

// Request/Response types
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Success      bool   `json:"success"`
	SessionToken string `json:"session_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	User         *User  `json:"user,omitempty"`
	Error        string `json:"error,omitempty"`
}

type ValidateSessionRequest struct {
	SessionToken string `json:"session_token"`
}

type ValidateSessionResponse struct {
	Valid     bool   `json:"valid"`
	ExpiresAt int64  `json:"expires_at,omitempty"`
	User      *User  `json:"user,omitempty"`
	Error     string `json:"error,omitempty"`
}

type RefreshSessionRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type RefreshSessionResponse struct {
	Success      bool   `json:"success"`
	SessionToken string `json:"session_token,omitempty"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	User         *User  `json:"user,omitempty"`
	Error        string `json:"error,omitempty"`
}

type LogoutRequest struct {
	SessionToken string `json:"session_token"`
}

type LogoutResponse struct {
	Success bool `json:"success"`
}

type PermissionRequest struct {
	SessionToken string `json:"session_token"`
	Permission   string `json:"permission"`
}

type PermissionResponse struct {
	HasPermission   bool     `json:"has_permission"`
	UserRole        string   `json:"user_role,omitempty"`
	UserPermissions []string `json:"user_permissions,omitempty"`
	Error           string   `json:"error,omitempty"`
}

type User struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

// NewAuthServer creates a new Authentication server
func NewAuthServer() *AuthServer {
	// Initialize with mock users for testing
	users := map[string]*UserInfo{
		"admin@legal-ai.com": {
			ID:           "user_001",
			Email:        "admin@legal-ai.com",
			PasswordHash: "hashed_password_123", // In production, use proper bcrypt
			Role:         "admin",
			Permissions:  []string{"read", "write", "admin", "ai_access", "case_management"},
			CreatedAt:    time.Now().Add(-30 * 24 * time.Hour),
			LastLogin:    time.Now().Add(-1 * time.Hour),
			Active:       true,
		},
		"lawyer@legal-ai.com": {
			ID:           "user_002",
			Email:        "lawyer@legal-ai.com",
			PasswordHash: "hashed_password_456",
			Role:         "lawyer",
			Permissions:  []string{"read", "write", "ai_access", "case_management"},
			CreatedAt:    time.Now().Add(-15 * 24 * time.Hour),
			LastLogin:    time.Now().Add(-2 * time.Hour),
			Active:       true,
		},
		"paralegal@legal-ai.com": {
			ID:           "user_003",
			Email:        "paralegal@legal-ai.com",
			PasswordHash: "hashed_password_789",
			Role:         "paralegal",
			Permissions:  []string{"read", "ai_access"},
			CreatedAt:    time.Now().Add(-7 * 24 * time.Hour),
			LastLogin:    time.Now().Add(-3 * time.Hour),
			Active:       true,
		},
	}

	return &AuthServer{
		port:          "8150",
		sessions:      make(map[string]*SessionInfo),
		users:         users,
		refreshTokens: make(map[string]*RefreshTokenInfo),
	}
}

// Login handler
func (s *AuthServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Login attempt for email: %s", req.Email)

	// Validate user credentials
	user, exists := s.users[req.Email]
	if !exists || !user.Active {
		log.Printf("Login failed: user not found or inactive - %s", req.Email)
		response := LoginResponse{
			Success: false,
			Error:   "Invalid credentials",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// In production, use proper password verification (bcrypt)
	if user.PasswordHash != "hashed_password_123" &&
	   user.PasswordHash != "hashed_password_456" &&
	   user.PasswordHash != "hashed_password_789" {
		log.Printf("Login failed: invalid password - %s", req.Email)
		response := LoginResponse{
			Success: false,
			Error:   "Invalid credentials",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Generate session token
	sessionToken, err := s.generateSecureToken()
	if err != nil {
		log.Printf("Failed to generate session token: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate refresh token
	refreshToken, err := s.generateSecureToken()
	if err != nil {
		log.Printf("Failed to generate refresh token: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Create session
	sessionInfo := &SessionInfo{
		UserID:    user.ID,
		Email:     user.Email,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(24 * time.Hour), // 24 hour session
		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	}

	// Create refresh token info
	refreshInfo := &RefreshTokenInfo{
		UserID:    user.ID,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 day refresh
		Used:      false,
	}

	// Store session and refresh token
	s.sessions[sessionToken] = sessionInfo
	s.refreshTokens[refreshToken] = refreshInfo

	// Update user last login
	user.LastLogin = time.Now()

	log.Printf("Login successful for user: %s (ID: %s)", user.Email, user.ID)

	response := LoginResponse{
		Success:      true,
		SessionToken: sessionToken,
		RefreshToken: refreshToken,
		ExpiresAt:    sessionInfo.ExpiresAt.Unix(),
		User: &User{
			ID:          user.ID,
			Email:       user.Email,
			Role:        user.Role,
			Permissions: user.Permissions,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Validate session handler
func (s *AuthServer) handleValidateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ValidateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Validating session token: %s...", req.SessionToken[:min(8, len(req.SessionToken))])

	session, exists := s.sessions[req.SessionToken]
	if !exists {
		log.Printf("Session validation failed: token not found")
		response := ValidateSessionResponse{
			Valid: false,
			Error: "Invalid session token",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Check if session is expired
	if time.Now().After(session.ExpiresAt) {
		log.Printf("Session validation failed: token expired")
		delete(s.sessions, req.SessionToken)
		response := ValidateSessionResponse{
			Valid: false,
			Error: "Session expired",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Get user info
	var user *UserInfo
	for _, u := range s.users {
		if u.ID == session.UserID {
			user = u
			break
		}
	}

	if user == nil || !user.Active {
		log.Printf("Session validation failed: user not found or inactive")
		delete(s.sessions, req.SessionToken)
		response := ValidateSessionResponse{
			Valid: false,
			Error: "User account not found or inactive",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	log.Printf("Session validation successful for user: %s", user.Email)

	response := ValidateSessionResponse{
		Valid:     true,
		ExpiresAt: session.ExpiresAt.Unix(),
		User: &User{
			ID:          user.ID,
			Email:       user.Email,
			Role:        user.Role,
			Permissions: user.Permissions,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Check permissions handler
func (s *AuthServer) handleCheckPermissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Checking permissions for session: %s...", req.SessionToken[:min(8, len(req.SessionToken))])

	session, exists := s.sessions[req.SessionToken]
	if !exists {
		response := PermissionResponse{
			HasPermission: false,
			Error:         "Invalid session",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Get user
	var user *UserInfo
	for _, u := range s.users {
		if u.ID == session.UserID {
			user = u
			break
		}
	}

	if user == nil {
		response := PermissionResponse{
			HasPermission: false,
			Error:         "User not found",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Check if user has the required permission
	hasPermission := false
	for _, perm := range user.Permissions {
		if perm == req.Permission {
			hasPermission = true
			break
		}
	}

	// Admin role has all permissions
	if user.Role == "admin" {
		hasPermission = true
	}

	log.Printf("Permission check result: %t for permission '%s' and user '%s'", hasPermission, req.Permission, user.Email)

	response := PermissionResponse{
		HasPermission:   hasPermission,
		UserRole:        user.Role,
		UserPermissions: user.Permissions,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// generateSecureToken generates a cryptographically secure random token
func (s *AuthServer) generateSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// HTTP handlers for health checks and session management
func (s *AuthServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":          "healthy",
		"service":         "auth-service",
		"version":         "1.0.0",
		"timestamp":       time.Now(),
		"active_sessions": len(s.sessions),
		"total_users":     len(s.users),
		"refresh_tokens":  len(s.refreshTokens),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func (s *AuthServer) handleSessions(w http.ResponseWriter, r *http.Request) {
	activeSessions := make([]map[string]interface{}, 0)
	for token, session := range s.sessions {
		activeSessions = append(activeSessions, map[string]interface{}{
			"token_preview": token[:8] + "...",
			"user_id":       session.UserID,
			"email":         session.Email,
			"created_at":    session.CreatedAt,
			"expires_at":    session.ExpiresAt,
			"ip_address":    session.IPAddress,
		})
	}

	response := map[string]interface{}{
		"service":         "auth-service",
		"active_sessions": activeSessions,
		"total_sessions":  len(s.sessions),
		"timestamp":       time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *AuthServer) handleUsers(w http.ResponseWriter, r *http.Request) {
	users := make([]map[string]interface{}, 0)
	for _, user := range s.users {
		users = append(users, map[string]interface{}{
			"id":          user.ID,
			"email":       user.Email,
			"role":        user.Role,
			"permissions": user.Permissions,
			"created_at":  user.CreatedAt,
			"last_login":  user.LastLogin,
			"active":      user.Active,
		})
	}

	response := map[string]interface{}{
		"service":     "auth-service",
		"users":       users,
		"total_users": len(users),
		"timestamp":   time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *AuthServer) setupRoutes() {
	http.HandleFunc("/health", s.handleHealth)
	http.HandleFunc("/sessions", s.handleSessions)
	http.HandleFunc("/users", s.handleUsers)
	http.HandleFunc("/api/v1/login", s.handleLogin)
	http.HandleFunc("/api/v1/validate", s.handleValidateSession)
	http.HandleFunc("/api/v1/permissions", s.handleCheckPermissions)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	log.Println("🔐 Starting Authentication Service")

	server := NewAuthServer()
	server.setupRoutes()

	// Graceful shutdown
	go func() {
		sigterm := make(chan os.Signal, 1)
		signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)
		<-sigterm
		log.Println("🛑 Shutting down Auth Service gracefully...")
		os.Exit(0)
	}()

	log.Printf("🌐 HTTP Auth Service starting on port %s", server.port)
	log.Printf("👥 Managing %d users with %d active sessions", len(server.users), len(server.sessions))
	log.Printf("🔗 Available endpoints:")
	log.Printf("  GET  /health - Service health check")
	log.Printf("  GET  /sessions - List active sessions")
	log.Printf("  GET  /users - List all users")
	log.Printf("  POST /api/v1/login - User authentication")
	log.Printf("  POST /api/v1/validate - Session validation")
	log.Printf("  POST /api/v1/permissions - Permission checking")

	if err := http.ListenAndServe(":"+server.port, nil); err != nil {
		log.Fatalf("Failed to serve HTTP: %v", err)
	}
}