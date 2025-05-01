package auth

import (
	"log"
	"net/http"
)

// AuthMiddleware is a middleware that validates JWT tokens
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		token, err := ExtractToken(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Verify token with auth service
		claims, err := VerifyToken(token)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Add user info to request headers for downstream handlers
		r.Header.Set("X-User-ID", claims.UserID)
		r.Header.Set("X-Username", claims.Username)

		// Token is valid, proceed
		next.ServeHTTP(w, r)
	})
}

// GetUserID extracts the user ID from the request headers
func GetUserID(r *http.Request) string {
	return r.Header.Get("X-User-ID")
}

// GetUsername extracts the username from the request headers
func GetUsername(r *http.Request) string {
	return r.Header.Get("X-Username")
}

// RequireAuth is a middleware that ensures a user ID is present
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := GetUserID(r)
		if userID == "" {
			log.Printf("User ID is required but not found in request")
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}
		next(w, r)
	}
}

// CheckProjectOwnership verifies if a user has access to a project
func CheckProjectOwnership(userID string, projectUserID string) bool {
	// If the project doesn't have a user ID, allow access (backward compatibility)
	if projectUserID == "" {
		return true
	}
	
	// Otherwise, check if the user owns the project
	return userID == projectUserID
}
