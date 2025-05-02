package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Function represents a serverless function
type Function struct {
	Name      string            `json:"name"`
	Image     string            `json:"image"`
	Container string            `json:"container,omitempty"`
	Running   bool              `json:"running"`
	Env       map[string]string `json:"env,omitempty"`
	UserID    string            `json:"user_id,omitempty"`
}

// Function registry with persistence
var (
	functions = make(map[string]*Function)
	mutex     = &sync.RWMutex{}
	registryFile = "/app/data/functions.json" // Path to store function data
)

// CORS middleware to allow cross-origin requests
func enableCors(w http.ResponseWriter, r *http.Request) {
	// Only set CORS headers if they don't already exist
	if w.Header().Get("Access-Control-Allow-Origin") == "" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	if w.Header().Get("Access-Control-Allow-Methods") == "" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	}
	if w.Header().Get("Access-Control-Allow-Headers") == "" {
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Username")
	}
	if w.Header().Get("Access-Control-Expose-Headers") == "" {
		w.Header().Set("Access-Control-Expose-Headers", "X-User-ID, X-Username")
	}

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
	}
}

// Note: Port allocation functions have been removed as we now use internal Docker networking

// Note: Port allocation functions have been removed as we now use internal Docker networking

// Start a function container
func startContainer(function *Function) error {
	// Generate a unique container name
	containerName := fmt.Sprintf("%s-%d", function.Name, time.Now().Unix())

	// For MVP, we'll use the host's localhost:5001 which is mapped to the registry container
	image := function.Image
	// Ensure we're using localhost:5001 for the registry
	if strings.Contains(image, "registry:") {
		image = strings.Replace(image, "registry:", "localhost:", 1)
	}

	// Get the network name from environment or use default with project prefix
	networkName := os.Getenv("FUNCTION_NETWORK")
	if networkName == "" {
		// Use the Docker Compose prefixed network name
		networkName = "platform-repository_function-network"
	}

	// Log the network we're connecting to
	log.Printf("Starting container for function %s on network %s", function.Name, networkName)

	// Prepare docker run command - no port binding needed anymore
	args := []string{
		"run",
		"-d",
		"--name", containerName,
		"--network", networkName, // Connect to the function network
		"--label", fmt.Sprintf("function=%s", function.Name), // Add label for function identification
		"--restart", "unless-stopped", // Restart policy
	}

	// Add environment variables
	for key, value := range function.Env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", key, value))
	}

	// Add image name
	args = append(args, image)

	// Execute docker command with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", args...)
	output, err := cmd.CombinedOutput()

	// If successful, update function and return
	if err == nil {
		// Update function with container ID
		function.Container = strings.TrimSpace(string(output))
		function.Running = true

		log.Printf("Started container %s for function %s using internal networking",
			function.Container, function.Name)

		return nil
	}

	// If there was an error, log and return
	log.Printf("Failed to start container for function %s: %v\nOutput: %s",
		function.Name, err, string(output))
	return err
}

// Stop a function container
func stopContainer(function *Function) error {
	// First check if the container is actually running
	if function.Container == "" {
		function.Running = false
		return nil
	}

	// Verify if the container is actually running
	if !isContainerRunning(function.Container) {
		log.Printf("Container %s for function %s is not running, updating status",
			function.Container, function.Name)
		function.Container = ""
		function.Running = false
		return nil
	}

	// Stop the container
	cmd := exec.Command("docker", "stop", function.Container)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Error stopping container %s: %v\nOutput: %s",
			function.Container, err, string(output))
		return err
	}

	// Remove the container
	cmd = exec.Command("docker", "rm", function.Container)
	output, err = cmd.CombinedOutput()
	if err != nil {
		log.Printf("Error removing container %s: %v\nOutput: %s",
			function.Container, err, string(output))
		// Don't return error here, as the container is already stopped
	}

	function.Container = ""
	function.Running = false

	log.Printf("Stopped container for function %s", function.Name)

	return nil
}

// saveRegistry saves the function registry to a file
func saveRegistry() error {
	mutex.RLock()
	defer mutex.RUnlock()

	// Create a copy of the functions map without runtime-specific data
	persistentFunctions := make(map[string]Function)
	for name, fn := range functions {
		// Create a copy without container ID and running state
		persistentFn := *fn
		persistentFn.Container = ""
		persistentFn.Running = false
		persistentFunctions[name] = persistentFn
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(registryFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("Error creating directory for registry file: %v", err)
		return err
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(persistentFunctions, "", "  ")
	if err != nil {
		log.Printf("Error marshaling functions: %v", err)
		return err
	}

	// Write to file
	if err := ioutil.WriteFile(registryFile, data, 0644); err != nil {
		log.Printf("Error writing registry file: %v", err)
		return err
	}

	log.Printf("Function registry saved with %d functions", len(persistentFunctions))
	return nil
}

// loadRegistry loads the function registry from a file
func loadRegistry() error {
	// Check if file exists
	if _, err := os.Stat(registryFile); os.IsNotExist(err) {
		log.Printf("Registry file does not exist, starting with empty registry")
		return nil
	}

	// Read file
	data, err := ioutil.ReadFile(registryFile)
	if err != nil {
		log.Printf("Error reading registry file: %v", err)
		return err
	}

	// Unmarshal JSON
	persistentFunctions := make(map[string]Function)
	if err := json.Unmarshal(data, &persistentFunctions); err != nil {
		log.Printf("Error unmarshaling functions: %v", err)
		return err
	}

	// Copy to functions map
	mutex.Lock()
	defer mutex.Unlock()

	for name, fn := range persistentFunctions {
		fnCopy := fn // Create a copy to avoid reference issues
		functions[name] = &fnCopy
	}

	log.Printf("Loaded %d functions from registry", len(persistentFunctions))
	return nil
}

func main() {
	// Load function registry from file
	if err := loadRegistry(); err != nil {
		log.Printf("Warning: Failed to load function registry: %v", err)
	}
	// Register function handler
	http.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		var function Function
		if err := json.NewDecoder(r.Body).Decode(&function); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Set the user ID for the function
		function.UserID = userID

		// No need to assign ports with internal networking

		// Ensure the image name includes the user ID
		// Check if the image name already has the user ID prefix
		if !strings.HasPrefix(function.Image, "localhost:5001/"+userID+"-") {
			// If not, update the image name to include the user ID
			imageParts := strings.Split(function.Image, "/")
			if len(imageParts) > 1 {
				// Extract the function name and tag
				nameAndTag := strings.Split(imageParts[1], ":")
				if len(nameAndTag) > 0 {
					// Create a new image name with user ID
					function.Image = fmt.Sprintf("localhost:5001/%s-%s:%s", 
						userID, 
						nameAndTag[0], 
						nameAndTag[len(nameAndTag)-1])
					log.Printf("Updated image name to include user ID: %s", function.Image)
				}
			}
		}

		// Store function in registry
		mutex.Lock()
		// Use composite key of userID + "-" + functionName to prevent collisions
		functionKey := function.UserID + "-" + function.Name
		functions[functionKey] = &function
		mutex.Unlock()
		
		// Save registry to file
		go saveRegistry()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Function '%s' registered successfully", function.Name),
		})
	})

	// Invoke function handler
	http.HandleFunc("/invoke/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Extract function name from path
		path := strings.TrimPrefix(r.URL.Path, "/invoke/")
		functionName := strings.Split(path, "/")[0]

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")

		// Try to find the function using the composite key first
		mutex.RLock()
		var function *Function
		var exists bool
		if userID != "" {
			functionKey := userID + "-" + functionName
			function, exists = functions[functionKey]
		}

		// If not found with composite key, try legacy lookup for backward compatibility
		if !exists {
			// Look for functions with matching name regardless of owner
			for _, fn := range functions {
				if fn.Name == functionName {
					function = fn
					exists = true
					break
				}
			}
		}
		mutex.RUnlock()

		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Only check ownership if user ID is provided (for backward compatibility)
		if userID != "" && function.UserID != "" && function.UserID != userID {
			http.Error(w, "You do not have permission to invoke this function", http.StatusForbidden)
			return
		}

		// Start container if not running
		if !function.Running {
			mutex.Lock()
			if !function.Running {
				log.Printf("Starting container for function %s before invocation", functionName)
				if err := startContainer(function); err != nil {
					mutex.Unlock()
					http.Error(w, fmt.Sprintf("Failed to start function: %v", err), http.StatusInternalServerError)
					return
				}

				// Wait for container to start and initialize
				log.Printf("Waiting for function %s container to initialize", functionName)
				time.Sleep(3 * time.Second)
			}
			mutex.Unlock()
		}
		
		// Verify container is actually running
		if function.Container != "" && !isContainerRunning(function.Container) {
			log.Printf("Container for function %s is not running, attempting to restart", functionName)
			mutex.Lock()
			function.Container = ""
			function.Running = false
			if err := startContainer(function); err != nil {
				mutex.Unlock()
				http.Error(w, fmt.Sprintf("Failed to restart function: %v", err), http.StatusInternalServerError)
				return
			}
			time.Sleep(3 * time.Second)
			mutex.Unlock()
		}

		// Forward request to function container via the reverse proxy
		// Extract the path after the function name
		subPath := ""
		if len(strings.Split(path, "/")) > 1 {
			subPath = strings.Join(strings.Split(path, "/")[1:], "/")
		}

		// Build the URL to the function-proxy service
		functionURL := fmt.Sprintf("http://function-proxy:8090/function/%s", functionName)
		if subPath != "" {
			functionURL = fmt.Sprintf("%s/%s", functionURL, subPath)
		}
		if r.URL.RawQuery != "" {
			functionURL = fmt.Sprintf("%s?%s", functionURL, r.URL.RawQuery)
		}

		log.Printf("Forwarding request to function %s via proxy: %s", functionName, functionURL)

		// Create a new request to the function proxy
		proxyReq, err := http.NewRequest(r.Method, functionURL, r.Body)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error creating proxy request: %v", err), http.StatusInternalServerError)
			return
		}

		// Copy headers
		for key, values := range r.Header {
			for _, value := range values {
				proxyReq.Header.Add(key, value)
			}
		}

		// Send request to function via proxy with increased timeout
		client := &http.Client{Timeout: 25 * time.Second} // Increased timeout but less than client-side 30s
		resp, err := client.Do(proxyReq)
		if err != nil {
			log.Printf("Error invoking function %s via proxy: %v", functionName, err)
			http.Error(w, fmt.Sprintf("Error invoking function: %v", err), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		// Copy response headers
		for key, values := range resp.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}

		// Copy status code
		w.WriteHeader(resp.StatusCode)

		// Copy response body
		io.Copy(w, resp.Body)
	})

	// List functions handler - supports both /list and /list/{userId}
	http.HandleFunc("/list/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Extract user ID from path
		path := strings.TrimPrefix(r.URL.Path, "/list/")
		userIDFromPath := path

		// Create a copy of the functions map to avoid long lock times
		mutex.RLock()
		functionsCopy := make(map[string]*Function)
		for _, fn := range functions {
			// For user-specific listing, only include functions owned by the specified user
			if userIDFromPath != "" && fn.UserID == userIDFromPath {
				// Create a deep copy of each function
				fnCopy := *fn
				functionsCopy[fn.Name] = &fnCopy
			}
		}
		mutex.RUnlock()

		// Verify the status of each function's container
		for _, fn := range functionsCopy {
			if fn.Container != "" {
				actuallyRunning := isContainerRunning(fn.Container)

				// If the status has changed, update the original function in the map
				if fn.Running != actuallyRunning {
					log.Printf("Function %s container status mismatch: recorded=%v, actual=%v",
						fn.Name, fn.Running, actuallyRunning)

					// Update the copy
					fn.Running = actuallyRunning

					// Also update the original
					mutex.Lock()
					// Use composite key to find the original function
					functionKey := fn.UserID + "-" + fn.Name
					if original, exists := functions[functionKey]; exists {
						original.Running = actuallyRunning
						if !actuallyRunning {
							original.Container = ""
						}
					}
					mutex.Unlock()
				}
			}
		}

		// Convert to a response format with additional information
		type FunctionResponse struct {
			Name      string            `json:"name"`
			Image     string            `json:"image"`
			Container string            `json:"container,omitempty"`
			Running   bool              `json:"running"`
			Env       map[string]string `json:"env,omitempty"`
			Endpoint  string            `json:"endpoint"`
			UserID    string            `json:"user_id,omitempty"`
		}

		// Create a map with function names as keys
		responseMap := make(map[string]FunctionResponse)
		for _, fn := range functionsCopy {
			// Create endpoint URL for the function
			endpoint := fmt.Sprintf("/function/%s", fn.Name)
			responseMap[fn.Name] = FunctionResponse{
				Name:      fn.Name,
				Image:     fn.Image,
				Container: fn.Container,
				Running:   fn.Running,
				Env:       fn.Env,
				Endpoint:  endpoint,
				UserID:    fn.UserID,
			}
		}

		// Write the response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(responseMap)
	})

	// List functions handler
	http.HandleFunc("/list", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")

		// Create a copy of the functions map to avoid long lock times
		mutex.RLock()
		functionsCopy := make(map[string]*Function)
		for key, fn := range functions {
			// For backward compatibility, include functions without a user ID
			// or functions owned by the requesting user
			if fn.UserID == "" || fn.UserID == userID {
				// Create a deep copy of each function
				fnCopy := *fn
				
				// If the function doesn't have a user ID and we have a user ID,
				// assign the current user as the owner for backward compatibility
				if fn.UserID == "" && userID != "" {
					log.Printf("Assigning user %s as owner of function %s for backward compatibility", userID, fn.Name)
					fnCopy.UserID = userID
					
					// Update the original function in the registry
					// Create new key with user ID
					newKey := userID + "-" + fn.Name
					functions[newKey] = &fnCopy
					// Remove the old entry without user ID
					delete(functions, key)
				}
				
				functionsCopy[fn.Name] = &fnCopy
			}
		}
		mutex.RUnlock()

		// Verify the status of each function's container
		for _, fn := range functionsCopy {
			if fn.Container != "" {
				actuallyRunning := isContainerRunning(fn.Container)

				// If the status has changed, update the original function in the map
				if fn.Running != actuallyRunning {
					log.Printf("Function %s container status mismatch: recorded=%v, actual=%v",
						fn.Name, fn.Running, actuallyRunning)

					// Update the copy
					fn.Running = actuallyRunning

					// Also update the original
					mutex.Lock()
					// Use composite key to find the original function
					functionKey := fn.UserID + "-" + fn.Name
					if original, exists := functions[functionKey]; exists {
						original.Running = actuallyRunning
						if !actuallyRunning {
							original.Container = ""
						}
					}
					mutex.Unlock()
				}
			}
		}

		// Convert to a response format with additional information
		type FunctionResponse struct {
			Name      string            `json:"name"`
			Image     string            `json:"image"`
			Container string            `json:"container,omitempty"`
			Running   bool              `json:"running"`
			Env       map[string]string `json:"env,omitempty"`
			Endpoint  string            `json:"endpoint"`
			UserID    string            `json:"user_id,omitempty"`
		}

		// Create a map with function names as keys
		responseMap := make(map[string]FunctionResponse)
		for _, fn := range functionsCopy {
			// Create endpoint URL for the function
			endpoint := fmt.Sprintf("/function/%s", fn.Name)
			responseMap[fn.Name] = FunctionResponse{
				Name:      fn.Name,
				Image:     fn.Image,
				Container: fn.Container,
				Running:   fn.Running,
				Env:       fn.Env,
				Endpoint:  endpoint,
				UserID:    fn.UserID,
			}
		}

		// Write the response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(responseMap)
	})

	// Start function handler
	http.HandleFunc("/start/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		functionName := strings.TrimPrefix(r.URL.Path, "/start/")

		mutex.Lock()
		defer mutex.Unlock()

		// Use composite key to find the function
		functionKey := userID + "-" + functionName
		function, exists := functions[functionKey]
		
		// If not found with composite key, try to find by name for backward compatibility
		if !exists {
			log.Printf("Function not found with composite key %s, trying to find by name", functionKey)
			// Look for functions with matching name and user ID
			for key, fn := range functions {
				if fn.Name == functionName && fn.UserID == userID {
					function = fn
					exists = true
					functionKey = key
					break
				}
			}
		}
		
		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Check if the user owns this function
		if function.UserID != userID {
			http.Error(w, "You do not have permission to start this function", http.StatusForbidden)
			return
		}

		// Check if the container is already running
		if function.Container != "" {
			if isContainerRunning(function.Container) {
				function.Running = true
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{
					"message": fmt.Sprintf("Function '%s' is already running", functionName),
				})
				return
			} else {
				// Container exists but is not running, clear it
				function.Container = ""
				function.Running = false
			}
		}

		// Start the container
		if err := startContainer(function); err != nil {
			http.Error(w, fmt.Sprintf("Failed to start function: %v", err), http.StatusInternalServerError)
			return
		}

		// Verify the container is actually running
		if !isContainerRunning(function.Container) {
			function.Running = false
			http.Error(w, "Container started but is not running", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":   fmt.Sprintf("Function '%s' started successfully", functionName),
			"running":   true,
			"container": function.Container,
		})
	})

	// Stop function handler
	http.HandleFunc("/stop/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		functionName := strings.TrimPrefix(r.URL.Path, "/stop/")

		mutex.Lock()
		defer mutex.Unlock()

		// Use composite key to find the function
		functionKey := userID + "-" + functionName
		function, exists := functions[functionKey]
		
		// If not found with composite key, try to find by name for backward compatibility
		if !exists {
			log.Printf("Function not found with composite key %s, trying to find by name", functionKey)
			// Look for functions with matching name and user ID
			for key, fn := range functions {
				if fn.Name == functionName && fn.UserID == userID {
					function = fn
					exists = true
					functionKey = key
					break
				}
			}
		}
		
		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Check if the user owns this function
		if function.UserID != userID {
			http.Error(w, "You do not have permission to stop this function", http.StatusForbidden)
			return
		}

		// Check if the function is already stopped
		if function.Container == "" || !isContainerRunning(function.Container) {
			function.Running = false
			function.Container = ""
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"message": fmt.Sprintf("Function '%s' is not running", functionName),
			})
			return
		}

		// Stop the container
		if err := stopContainer(function); err != nil {
			http.Error(w, fmt.Sprintf("Failed to stop function: %v", err), http.StatusInternalServerError)
			return
		}

		// Verify the container is actually stopped
		if isContainerRunning(function.Container) {
			http.Error(w, "Failed to stop container, it is still running", http.StatusInternalServerError)
			return
		}

		function.Running = false
		function.Container = ""

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": fmt.Sprintf("Function '%s' stopped successfully", functionName),
			"running": false,
		})
	})

	// Delete function handler
	http.HandleFunc("/delete/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS with explicit headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract user ID from request headers
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		functionName := strings.TrimPrefix(r.URL.Path, "/delete/")

		mutex.Lock()
		defer mutex.Unlock()

		// Use composite key to find the function
		functionKey := userID + "-" + functionName
		function, exists := functions[functionKey]
		
		// If not found with composite key, try to find by name for backward compatibility
		if !exists {
			log.Printf("Function not found with composite key %s, trying to find by name", functionKey)
			// Look for functions with matching name and user ID
			for key, fn := range functions {
				if fn.Name == functionName && fn.UserID == userID {
					function = fn
					exists = true
					functionKey = key
					break
				}
			}
		}
		
		if !exists {
			log.Printf("Function '%s' not found for deletion", functionName)
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Check if the user owns this function
		if function.UserID != userID {
			log.Printf("User %s attempted to delete function %s owned by %s", userID, functionName, function.UserID)
			http.Error(w, "You do not have permission to delete this function", http.StatusForbidden)
			return
		}

		log.Printf("Deleting function '%s', current status: running=%v, container=%s", 
			functionName, function.Running, function.Container)

		// Stop the container if it's running
		if function.Container != "" {
			log.Printf("Stopping container for function '%s' before deletion", functionName)
			if err := stopContainer(function); err != nil {
				log.Printf("Warning: Failed to stop container for function '%s' during deletion: %v", functionName, err)
				// Continue with deletion even if stopping fails
			} else {
				log.Printf("Container for function '%s' stopped successfully", functionName)
			}
		}

		// Delete the function from the registry
		delete(functions, functionKey)
		log.Printf("Function '%s' removed from registry", functionName)
		
		// Save registry to file
		go saveRegistry()

		// Set response headers
		w.Header().Set("Content-Type", "application/json")
		
		// Send success response
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Function '%s' deleted successfully", functionName),
			"status": "success",
		})
		log.Printf("Delete response sent for function '%s'", functionName)
	})

	// Health check endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Get function logs endpoint (plain text version)
	http.HandleFunc("/logs/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Extract function name from path
		functionName := strings.TrimPrefix(r.URL.Path, "/logs/")
		
		// Get lines parameter (default to 100)
		lines := 100
		if linesParam := r.URL.Query().Get("lines"); linesParam != "" {
			if parsedLines, err := strconv.Atoi(linesParam); err == nil && parsedLines > 0 {
				lines = parsedLines
			}
		}

		mutex.RLock()
		function, exists := functions[functionName]
		mutex.RUnlock()

		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Check if the function has a container
		if function.Container == "" {
			http.Error(w, "Function is not running", http.StatusBadRequest)
			return
		}

		// Get container logs
		logs := getContainerLogs(function.Container, lines)
		
		// Return logs as plain text
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(logs))
	})

	// Get function logs endpoint (JSON version)
	http.HandleFunc("/logs-json/", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Extract function name from path
		functionName := strings.TrimPrefix(r.URL.Path, "/logs-json/")
		
		// Get lines parameter (default to 100)
		lines := 100
		if linesParam := r.URL.Query().Get("lines"); linesParam != "" {
			if parsedLines, err := strconv.Atoi(linesParam); err == nil && parsedLines > 0 {
				lines = parsedLines
			}
		}

		mutex.RLock()
		function, exists := functions[functionName]
		mutex.RUnlock()

		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Check if the function has a container
		if function.Container == "" {
			// Return empty logs with a message
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"logs": "",
				"message": "Function is not running",
				"running": false,
			})
			return
		}

		// Get container logs
		logs := getContainerLogs(function.Container, lines)
		
		// Return logs as JSON
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"logs": logs,
			"running": true,
			"container": function.Container,
			"timestamp": time.Now().Unix(),
		})
	})

	// Start server
	port := 8081
	log.Printf("Function Controller starting on port %d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}
