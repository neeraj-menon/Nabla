package auth

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// UserClaims represents the claims in a JWT token
type UserClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
}

// AuthResponse represents the response from the auth service
type AuthResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
}

// VerifyToken verifies a JWT token with the auth service
func VerifyToken(token string) (*UserClaims, error) {
	// For backward compatibility during migration, accept dev-token
	if token == "dev-token" {
		return &UserClaims{
			UserID:   "admin",
			Username: "admin",
		}, nil
	}

	// Get auth service URL from environment or use default
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://auth-service:8084"
	}

	// Create request to auth service
	req, err := http.NewRequest("GET", authServiceURL+"/auth/me", nil)
	if err != nil {
		log.Printf("Error creating auth request: %v", err)
		return nil, fmt.Errorf("internal server error")
	}

	// Set the Authorization header
	req.Header.Set("Authorization", "Bearer "+token)

	// Send request to auth service
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error validating token: %v", err)
		return nil, fmt.Errorf("error validating token")
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		log.Printf("Auth service returned non-200 status: %d", resp.StatusCode)
		return nil, fmt.Errorf("invalid or expired token")
	}

	// Parse user info from response
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading auth response: %v", err)
		return nil, fmt.Errorf("internal server error")
	}

	var user AuthResponse
	if err := json.Unmarshal(body, &user); err != nil {
		log.Printf("Error parsing auth response: %v", err)
		return nil, fmt.Errorf("internal server error")
	}

	// Return user claims
	return &UserClaims{
		UserID:   user.ID,
		Username: user.Username,
	}, nil
}

// ExtractToken extracts the token from the Authorization header
func ExtractToken(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("authorization header required")
	}

	// Format: "Bearer TOKEN"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return "", fmt.Errorf("invalid authorization format")
	}

	return parts[1], nil
}
