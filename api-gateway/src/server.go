package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Simple auth middleware for MVP
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check for Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Simple token validation for MVP
		// Format: "Bearer TOKEN"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" || parts[1] != "dev-token" {
			http.Error(w, "Invalid authorization token", http.StatusUnauthorized)
			return
		}

		// Token is valid, proceed
		next.ServeHTTP(w, r)
	})
}

// CORS middleware to allow cross-origin requests
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Create a custom response writer that captures headers
		crw := &corsResponseWriter{ResponseWriter: w}

		// Set CORS headers
		crw.Header().Set("Access-Control-Allow-Origin", "*")
		crw.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		crw.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			crw.WriteHeader(http.StatusOK)
			return
		}

		// Call the next handler
		next.ServeHTTP(crw, r)
	})
}

// Custom response writer that ensures we don't have duplicate CORS headers
type corsResponseWriter struct {
	http.ResponseWriter
	headerWritten bool
}

// Override WriteHeader to clean up any duplicate CORS headers
func (crw *corsResponseWriter) WriteHeader(statusCode int) {
	if !crw.headerWritten {
		// Clean up any duplicate CORS headers that might have been added downstream
		crw.cleanupHeaders("Access-Control-Allow-Origin")
		crw.cleanupHeaders("Access-Control-Allow-Methods")
		crw.cleanupHeaders("Access-Control-Allow-Headers")
		crw.headerWritten = true
	}
	crw.ResponseWriter.WriteHeader(statusCode)
}

// Override Write to ensure headers are written
func (crw *corsResponseWriter) Write(b []byte) (int, error) {
	if !crw.headerWritten {
		crw.WriteHeader(http.StatusOK)
	}
	return crw.ResponseWriter.Write(b)
}

// Helper to clean up duplicate headers
func (crw *corsResponseWriter) cleanupHeaders(header string) {
	// If there are multiple values, keep only the first one
	values := crw.Header().Values(header)
	if len(values) > 1 {
		crw.Header().Del(header)
		crw.Header().Set(header, values[0])
	}
}

// Function metadata for routing
type Function struct {
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
}

// In-memory function registry for MVP
var functions = map[string]Function{}

// Controller endpoint for function invocation
var controllerEndpoint = "http://function-controller:8081"

func main() {
	// Function invocation handler
	functionHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract function name from path
		// Path format: /function/{name}
		path := strings.TrimPrefix(r.URL.Path, "/function/")
		functionName := strings.Split(path, "/")[0]

		// Get function from registry or use default controller endpoint
		var endpoint string
		function, exists := functions[functionName]
		if !exists {
			// For MVP, if function is not in registry, assume it exists and use controller endpoint
			endpoint = controllerEndpoint
		} else {
			endpoint = function.Endpoint
		}

		// Forward request to function controller
		targetURL, _ := url.Parse(endpoint)
		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		
		// Update request URL path to include function name
		r.URL.Path = "/invoke/" + functionName + strings.TrimPrefix(r.URL.Path, "/function/"+functionName)
		r.URL.Host = targetURL.Host
		r.URL.Scheme = targetURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Header.Get("Host"))
		r.Host = targetURL.Host

		proxy.ServeHTTP(w, r)
	})

	// Register function endpoint
	registerHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var function Function
		if err := json.NewDecoder(r.Body).Decode(&function); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Store function in registry with controller endpoint
		function.Endpoint = controllerEndpoint
		functions[function.Name] = function
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Function '%s' registered successfully", function.Name),
		})
	})

	// List registered functions
	listHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(functions)
	})

	// Set up routes
	mux := http.NewServeMux()
	mux.Handle("/function/", corsMiddleware(authMiddleware(functionHandler)))
	mux.Handle("/register", corsMiddleware(authMiddleware(registerHandler)))
	mux.Handle("/list", corsMiddleware(authMiddleware(listHandler)))

	// Health check endpoint (no auth required)
	mux.Handle("/health", corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})))

	// Start server
	port := 8080
	log.Printf("API Gateway starting on port %d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}
