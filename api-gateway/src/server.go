package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

// Auth service response for token validation
type AuthResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
}

// Auth middleware that validates JWT tokens with the auth service
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check for Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Format: "Bearer TOKEN"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization format", http.StatusUnauthorized)
			return
		}

		token := parts[1]

		// For backward compatibility during migration, accept dev-token
		if token == "dev-token" {
			// Create a context with default admin user
			r.Header.Set("X-User-ID", "admin")
			r.Header.Set("X-Username", "admin")
			next.ServeHTTP(w, r)
			return
		}

		// Validate token with auth service
		authServiceURL := os.Getenv("AUTH_SERVICE_URL")
		if authServiceURL == "" {
			authServiceURL = "http://auth-service:8084"
		}

		// Create request to auth service
		req, err := http.NewRequest("GET", authServiceURL+"/auth/me", nil)
		if err != nil {
			log.Printf("Error creating auth request: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Forward the token to auth service
		req.Header.Set("Authorization", authHeader)

		// Send request to auth service
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error validating token: %v", err)
			http.Error(w, "Error validating token", http.StatusUnauthorized)
			return
		}
		defer resp.Body.Close()

		// Check response status
		if resp.StatusCode != http.StatusOK {
			log.Printf("Auth service returned non-200 status: %d", resp.StatusCode)
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Parse user info from response
		body, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			log.Printf("Error reading auth response: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		var user AuthResponse
		if err := json.Unmarshal(body, &user); err != nil {
			log.Printf("Error parsing auth response: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Add user info to request headers for downstream services
		r.Header.Set("X-User-ID", user.ID)
		r.Header.Set("X-Username", user.Username)

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

// Proxy endpoint for direct function access (used for health checks)
var proxyEndpoint = "http://function-proxy:8090"

// checkServiceHealth checks if a service is healthy
func checkServiceHealth(healthEndpoint string) string {
	// Create a client with a short timeout
	client := &http.Client{
		Timeout: 2 * time.Second,
	}
	
	// Make request to health endpoint
	resp, err := client.Get(healthEndpoint)
	if err != nil {
		log.Printf("Health check failed for %s: %v", healthEndpoint, err)
		return "unhealthy"
	}
	defer resp.Body.Close()
	
	// Check response status
	if resp.StatusCode != http.StatusOK {
		log.Printf("Health check returned non-200 status for %s: %d", healthEndpoint, resp.StatusCode)
		return "degraded"
	}
	
	return "healthy"
}

func main() {
	// Function invocation handler
	functionHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract function name from path
		// Path format: /function/{name}
		path := strings.TrimPrefix(r.URL.Path, "/function/")
		functionName := strings.Split(path, "/")[0]
		subPath := strings.TrimPrefix(r.URL.Path, "/function/"+functionName)

		// Use the function proxy for invocation with the new internal routing approach
		endpoint := proxyEndpoint

		// Log the request
		log.Printf("Forwarding request to function: %s via proxy", functionName)

		// Forward request to function proxy
		targetURL, _ := url.Parse(endpoint)
		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		
		// Update request URL path to use the proxy's function endpoint format
		// The proxy expects: /function/{name}/{path}
		r.URL.Path = "/function/" + functionName + subPath
		r.URL.Host = targetURL.Host
		r.URL.Scheme = targetURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Header.Get("Host"))
		r.Host = targetURL.Host

		// Set a longer timeout for the proxy to handle cold starts
		proxy.Transport = &http.Transport{
			ResponseHeaderTimeout: 30 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
		}

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

	// Enhanced health check endpoint (no auth required)
	mux.Handle("/health", corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check controller health
		controllerHealth := checkServiceHealth(controllerEndpoint + "/health")
		
		// Check proxy health
		proxyHealth := checkServiceHealth(proxyEndpoint + "/health")
		
		// Prepare response
		response := map[string]interface{}{
			"status": "healthy",
			"services": map[string]interface{}{
				"api_gateway": "healthy",
				"function_controller": controllerHealth,
				"function_proxy": proxyHealth,
			},
			"timestamp": fmt.Sprintf("%d", time.Now().Unix()),
		}
		
		// If any service is unhealthy, mark overall status as degraded
		if controllerHealth != "healthy" || proxyHealth != "healthy" {
			response["status"] = "degraded"
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})))

	// Start server
	port := 8080
	log.Printf("API Gateway starting on port %d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}
