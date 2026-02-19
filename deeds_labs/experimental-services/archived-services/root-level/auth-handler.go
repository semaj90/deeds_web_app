//go:build archived
// +build archived

package main

import (
    "context"
    "crypto/rand"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "net/http"
    "strings"
    "time"

    "github.com/redis/go-redis/v9"
    "golang.org/x/crypto/bcrypt"
)

// AuthHandler handles authentication for the QUIC server
type AuthHandler struct {
    redisClient *redis.Client
    sessions    map[string]*SessionData
}

// SessionData represents an active user session
type SessionData struct {
    SessionID    string                 `json:"session_id"`
    UserID       string                 `json:"user_id"`
    Email        string                 `json:"email"`
    Role         string                 `json:"role"`
    IPAddress    string                 `json:"ip_address"`
    UserAgent    string                 `json:"user_agent"`
    CreatedAt    time.Time              `json:"created_at"`
    ExpiresAt    time.Time              `json:"expires_at"`
    LastAccessed time.Time              `json:"last_accessed"`
    Context      map[string]interface{} `json:"context"`
}

// User represents a user in the system
type User struct {
    ID           string    `json:"id"`
    Email        string    `json:"email"`
    PasswordHash string    `json:"password_hash"`
    FirstName    string    `json:"first_name"`
    LastName     string    `json:"last_name"`
    Organization string    `json:"organization"`
    Role         string    `json:"role"`
    CreatedAt    time.Time `json:"created_at"`
    UpdatedAt    time.Time `json:"updated_at"`
}

// UserProfile for client responses
type UserProfile struct {
    UserID       string            `json:"userId"`
    Email        string            `json:"email"`
    FirstName    string            `json:"firstName"`
    LastName     string            `json:"lastName"`
    Organization string            `json:"organization,omitempty"`
    Role         string            `json:"role"`
    CreatedAt    int64             `json:"createdAt"`
    UpdatedAt    int64             `json:"updatedAt"`
    Preferences  *UserPreferences  `json:"preferences,omitempty"`
    Permissions  *UserPermissions  `json:"permissions,omitempty"`
}

type UserPreferences struct {
    Theme              string `json:"theme"`
    Language           string `json:"language"`
    EmailNotifications bool   `json:"emailNotifications"`
    PushNotifications  bool   `json:"pushNotifications"`
    Timezone           string `json:"timezone"`
}

type UserPermissions struct {
    AllowedActions    []string          `json:"allowedActions"`
    AllowedResources  []string          `json:"allowedResources"`
    FeatureFlags      map[string]bool   `json:"featureFlags"`
    APIRateLimit      int               `json:"apiRateLimit"`
    StorageQuotaMB    int               `json:"storageQuotaMb"`
    CanAccessQuic     bool              `json:"canAccessQuic"`
    CanAccessGPU      bool              `json:"canAccessGpu"`
}

// NewAuthHandler creates a new authentication handler
func NewAuthHandler(redisClient *redis.Client) *AuthHandler {
    return &AuthHandler{
        redisClient: redisClient,
        sessions:    make(map[string]*SessionData),
    }
}

// HandleRegister handles user registration
func (h *AuthHandler) HandleRegister(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        Email        string            `json:"email"`
        Password     string            `json:"password"`
        FirstName    string            `json:"firstName"`
        LastName     string            `json:"lastName"`
        Organization string            `json:"organization"`
        Role         string            `json:"role"`
        Metadata     map[string]string `json:"metadata"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondWithError(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    // Validate input
    if req.Email == "" || req.Password == "" {
        respondWithError(w, "Email and password are required", http.StatusBadRequest)
        return
    }

    // Hash password
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
    if err != nil {
        respondWithError(w, "Failed to hash password", http.StatusInternalServerError)
        return
    }

    // Generate user ID
    userID := generateID("user")

    // Create user
    user := User{
        ID:           userID,
        Email:        req.Email,
        PasswordHash: string(hashedPassword),
        FirstName:    req.FirstName,
        LastName:     req.LastName,
        Organization: req.Organization,
        Role:         req.Role,
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }

    // Store user in Redis (in production, use PostgreSQL)
    userJSON, _ := json.Marshal(user)
    if h.redisClient != nil {
        err = h.redisClient.Set(context.Background(),
            fmt.Sprintf("user:%s", userID),
            userJSON,
            0).Err()
        if err != nil {
            fmt.Printf("Failed to store user in Redis: %v\n", err)
        }

        // Also store email->userID mapping for login
        h.redisClient.Set(context.Background(),
            fmt.Sprintf("email:%s", req.Email),
            userID,
            0)
    }

    // Create profile response
    profile := UserProfile{
        UserID:       user.ID,
        Email:        user.Email,
        FirstName:    user.FirstName,
        LastName:     user.LastName,
        Organization: user.Organization,
        Role:         user.Role,
        CreatedAt:    user.CreatedAt.Unix(),
        UpdatedAt:    user.UpdatedAt.Unix(),
    }

    respondWithJSON(w, map[string]interface{}{
        "success": true,
        "userId":  userID,
        "message": "User registered successfully",
        "profile": profile,
    })
}

// HandleLogin handles user login
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        Email               string            `json:"email"`
        Password            string            `json:"password"`
        IPAddress           string            `json:"ipAddress"`
        UserAgent           string            `json:"userAgent"`
        SessionDurationDays int               `json:"sessionDurationDays"`
        DeviceInfo          map[string]string `json:"deviceInfo"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondWithError(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    // Validate input
    if req.Email == "" || req.Password == "" {
        respondWithError(w, "Email and password are required", http.StatusBadRequest)
        return
    }

    // Get user ID from email
    var userID string
    var user User

    if h.redisClient != nil {
        // Get user ID from email mapping
        userID, _ = h.redisClient.Get(context.Background(),
            fmt.Sprintf("email:%s", req.Email)).Result()

        if userID != "" {
            // Get user data
            userJSON, _ := h.redisClient.Get(context.Background(),
                fmt.Sprintf("user:%s", userID)).Result()
            json.Unmarshal([]byte(userJSON), &user)
        }
    }

    // For demo, create a mock user if not found
    if userID == "" {
        // In production, return error if user not found
        hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
        user = User{
            ID:           generateID("user"),
            Email:        req.Email,
            PasswordHash: string(hashedPassword),
            FirstName:    "Demo",
            LastName:     "User",
            Role:         "user",
            CreatedAt:    time.Now(),
            UpdatedAt:    time.Now(),
        }
        userID = user.ID
    }

    // Verify password (for demo, always succeed)
    // In production: err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))

    // Create session
    sessionID := generateID("session")
    sessionDuration := 30
    if req.SessionDurationDays > 0 {
        sessionDuration = req.SessionDurationDays
    }

    expiresAt := time.Now().Add(time.Duration(sessionDuration) * 24 * time.Hour)

    session := &SessionData{
        SessionID:    sessionID,
        UserID:       userID,
        Email:        user.Email,
        Role:         user.Role,
        IPAddress:    req.IPAddress,
        UserAgent:    req.UserAgent,
        CreatedAt:    time.Now(),
        ExpiresAt:    expiresAt,
        LastAccessed: time.Now(),
        Context:      make(map[string]interface{}),
    }

    // Store session
    h.sessions[sessionID] = session

    // Store in Redis
    if h.redisClient != nil {
        sessionJSON, _ := json.Marshal(session)
        h.redisClient.Set(context.Background(),
            fmt.Sprintf("session:%s", sessionID),
            sessionJSON,
            time.Duration(sessionDuration)*24*time.Hour)
    }

    // Generate tokens
    accessToken := generateToken("access")
    refreshToken := generateToken("refresh")

    // Create profile
    profile := UserProfile{
        UserID:       user.ID,
        Email:        user.Email,
        FirstName:    user.FirstName,
        LastName:     user.LastName,
        Organization: user.Organization,
        Role:         user.Role,
        CreatedAt:    user.CreatedAt.Unix(),
        UpdatedAt:    user.UpdatedAt.Unix(),
        Permissions: &UserPermissions{
            AllowedActions:   []string{"read", "write"},
            AllowedResources: []string{"documents", "cases"},
            FeatureFlags: map[string]bool{
                "gpu_inference": true,
                "quic_enabled":  true,
            },
            APIRateLimit:   1000,
            StorageQuotaMB: 5000,
            CanAccessQuic:  true,
            CanAccessGPU:   true,
        },
    }

    respondWithJSON(w, map[string]interface{}{
        "success":      true,
        "sessionId":    sessionID,
        "userId":       userID,
        "expiresAt":    expiresAt.Unix() * 1000, // Convert to milliseconds
        "profile":      profile,
        "accessToken":  accessToken,
        "refreshToken": refreshToken,
    })
}

// HandleValidateSession validates an existing session
func (h *AuthHandler) HandleValidateSession(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        SessionID string `json:"sessionId"`
        IPAddress string `json:"ipAddress"`
        UserAgent string `json:"userAgent"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondWithError(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    // Check in-memory sessions first
    session, exists := h.sessions[req.SessionID]

    // If not in memory, check Redis
    if !exists && h.redisClient != nil {
        sessionJSON, err := h.redisClient.Get(context.Background(),
            fmt.Sprintf("session:%s", req.SessionID)).Result()
        if err == nil {
            json.Unmarshal([]byte(sessionJSON), &session)
            exists = true
        }
    }

    if !exists || session == nil {
        respondWithJSON(w, map[string]interface{}{
            "valid": false,
            "error": "Session not found",
        })
        return
    }

    // Check if session is expired
    if time.Now().After(session.ExpiresAt) {
        delete(h.sessions, req.SessionID)
        if h.redisClient != nil {
            h.redisClient.Del(context.Background(), fmt.Sprintf("session:%s", req.SessionID))
        }
        respondWithJSON(w, map[string]interface{}{
            "valid": false,
            "error": "Session expired",
        })
        return
    }

    // Update last accessed time
    session.LastAccessed = time.Now()
    h.sessions[req.SessionID] = session

    // Create profile
    profile := UserProfile{
        UserID:    session.UserID,
        Email:     session.Email,
        Role:      session.Role,
        CreatedAt: session.CreatedAt.Unix(),
    }

    respondWithJSON(w, map[string]interface{}{
        "valid":     true,
        "userId":    session.UserID,
        "profile":   profile,
        "expiresAt": session.ExpiresAt.Unix() * 1000,
        "metadata": map[string]interface{}{
            "sessionId":    session.SessionID,
            "createdAt":    session.CreatedAt.Unix(),
            "lastAccessed": session.LastAccessed.Unix(),
        },
    })
}

// HandleLogout handles user logout
func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        SessionID            string `json:"sessionId"`
        InvalidateAllSessions bool   `json:"invalidateAllSessions"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondWithError(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    sessionsInvalidated := 0

    if req.InvalidateAllSessions {
        // Get session to find user ID
        session, exists := h.sessions[req.SessionID]
        if exists {
            userID := session.UserID
            // Remove all sessions for this user
            for sid, sess := range h.sessions {
                if sess.UserID == userID {
                    delete(h.sessions, sid)
                    if h.redisClient != nil {
                        h.redisClient.Del(context.Background(), fmt.Sprintf("session:%s", sid))
                    }
                    sessionsInvalidated++
                }
            }
        }
    } else {
        // Remove single session
        delete(h.sessions, req.SessionID)
        if h.redisClient != nil {
            h.redisClient.Del(context.Background(), fmt.Sprintf("session:%s", req.SessionID))
        }
        sessionsInvalidated = 1
    }

    respondWithJSON(w, map[string]interface{}{
        "success":             true,
        "message":             "Logged out successfully",
        "sessionsInvalidated": sessionsInvalidated,
    })
}

// Helper functions

func generateID(prefix string) string {
    b := make([]byte, 16)
    rand.Read(b)
    return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b))
}

func generateToken(tokenType string) string {
    b := make([]byte, 32)
    rand.Read(b)
    return fmt.Sprintf("%s_%s", tokenType, hex.EncodeToString(b))
}

func respondWithJSON(w http.ResponseWriter, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(data)
}

func respondWithError(w http.ResponseWriter, message string, statusCode int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": false,
        "error":   message,
    })
}

// Middleware to check authentication
func (h *AuthHandler) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Check for session in Authorization header or cookie
        sessionID := r.Header.Get("X-Session-ID")
        if sessionID == "" {
            // Try to get from Authorization header
            auth := r.Header.Get("Authorization")
            if strings.HasPrefix(auth, "Bearer ") {
                sessionID = strings.TrimPrefix(auth, "Bearer ")
            }
        }

        if sessionID == "" {
            respondWithError(w, "Authentication required", http.StatusUnauthorized)
            return
        }

        // Validate session
        session, exists := h.sessions[sessionID]
        if !exists || time.Now().After(session.ExpiresAt) {
            respondWithError(w, "Invalid or expired session", http.StatusUnauthorized)
            return
        }

        // Add user context to request
        ctx := context.WithValue(r.Context(), "userID", session.UserID)
        ctx = context.WithValue(ctx, "userRole", session.Role)
        ctx = context.WithValue(ctx, "sessionID", session.SessionID)

        next(w, r.WithContext(ctx))
    }
}