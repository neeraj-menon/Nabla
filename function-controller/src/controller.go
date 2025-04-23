package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Function represents a serverless function
type Function struct {
	Name      string            `json:"name"`
	Image     string            `json:"image"`
	Port      int               `json:"port"`
	Container string            `json:"container,omitempty"`
	Running   bool              `json:"running"`
	Env       map[string]string `json:"env,omitempty"`
}

// In-memory function registry for MVP
var (
	functions = make(map[string]*Function)
	mutex     = &sync.RWMutex{}
	nextPort  = 9500          // Start from port 9500
	portMutex = &sync.Mutex{} // Mutex specifically for port allocation
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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	}

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
	}
}

// Get a unique port for a function container
func isPortAvailable(port int) bool {
	// Try to create a temporary container to check if we can bind to the port
	cmd := exec.Command("docker", "run", "--rm", "--name", fmt.Sprintf("port-test-%d", port), "-p", fmt.Sprintf("%d:8080", port), "alpine", "true")
	output, err := cmd.CombinedOutput()

	if err != nil {
		// If we get an error about port being in use, the port is not available
		if strings.Contains(string(output), "port is already allocated") || strings.Contains(string(output), "address already in use") {
			log.Printf("Port %d is in use: %s", port, string(output))
			return false
		}
		// If we get any other error, log it and handle it
		log.Printf("Unexpected error checking port %d: %v\nOutput: %s", port, err, string(output))
		// Assume the port might be available if it's not specifically a port in use error
		return true
	}

	// If we got here without errors, the port is available
	log.Printf("Port %d is available", port)
	return true
}

func getNextPort() int {
	// Lock to prevent concurrent port allocation
	portMutex.Lock()
	defer portMutex.Unlock()

	// Start from the current nextPort value
	startPort := nextPort

	// Try ports in a smaller range to find an available one
	for port := startPort; port < startPort+100; port++ {
		// Check if the port is already in use by another function
		portInUse := false
		mutex.RLock()
		for _, fn := range functions {
			if fn.Port == port {
				portInUse = true
				break
			}
		}
		mutex.RUnlock()

		// Check if port is available
		if !portInUse && isPortAvailable(port) {
			nextPort = port + 1
			log.Printf("Found available port: %d", port)
			return port
		} else {
			if portInUse {
				log.Printf("Port %d is already used by another function", port)
			} else {
				log.Printf("Port %d is not available", port)
			}
		}
	}

	// If we couldn't find an available port in the range, use a higher range
	nextPort = startPort + 100
	log.Printf("No available ports found in range %d-%d, moving to next range", startPort, startPort+99)
	return getNextPort() // Recursively try the next range
}

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

	// Try up to 3 times with different ports if we encounter port allocation errors
	for attempts := 0; attempts < 3; attempts++ {
		log.Printf("Attempting to start container with port %d (attempt %d/3)", function.Port, attempts+1)

		// Prepare docker run command
		args := []string{
			"run",
			"-d",
			"--name", containerName,
			"-p", fmt.Sprintf("%d:8080", function.Port),
		}

		// Add environment variables
		for key, value := range function.Env {
			args = append(args, "-e", fmt.Sprintf("%s=%s", key, value))
		}

		// Add image name
		args = append(args, image)

		// Execute docker command with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", args...)
		output, err := cmd.CombinedOutput()

		// If successful, update function and return
		if err == nil {
			// Update function with container ID
			function.Container = strings.TrimSpace(string(output))
			function.Running = true

			log.Printf("Started container %s for function %s on port %d",
				function.Container, function.Name, function.Port)

			return nil
		}

		// Check if the error is due to port allocation
		if strings.Contains(string(output), "port is already allocated") || strings.Contains(string(output), "address already in use") {
			log.Printf("Port %d is already in use, trying a different port", function.Port)

			// Clean up the failed container if it was created
			cleanupCmd := exec.Command("docker", "rm", "-f", containerName)
			cleanupCmd.Run() // Ignore errors from cleanup

			// Get a new port and try again
			function.Port = getNextPort()

			// Generate a new container name for the next attempt
			containerName = fmt.Sprintf("%s-%d", function.Name, time.Now().Unix())
			continue
		}

		// If it's not a port allocation error, return the error
		log.Printf("Failed to start container for function %s: %v\nOutput: %s",
			function.Name, err, string(output))
		return err
	}

	// If we've tried 3 times and still failed, return an error
	return fmt.Errorf("failed to start container after 3 attempts with different ports")
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

func main() {
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

		var function Function
		if err := json.NewDecoder(r.Body).Decode(&function); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Assign a port if not specified
		if function.Port == 0 {
			function.Port = getNextPort()
		}

		// Store function in registry
		mutex.Lock()
		functions[function.Name] = &function
		mutex.Unlock()

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

		mutex.RLock()
		function, exists := functions[functionName]
		mutex.RUnlock()

		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
			return
		}

		// Start container if not running
		if !function.Running {
			mutex.Lock()
			if !function.Running {
				if err := startContainer(function); err != nil {
					mutex.Unlock()
					http.Error(w, fmt.Sprintf("Failed to start function: %v", err), http.StatusInternalServerError)
					return
				}

				// Wait for container to start
				time.Sleep(2 * time.Second)
			}
			mutex.Unlock()
		}

		// Forward request to function container
		// Use host.docker.internal to access the host from inside the container
		functionURL := fmt.Sprintf("http://host.docker.internal:%d%s",
			function.Port,
			strings.TrimPrefix(r.URL.Path, "/invoke/"+functionName))

		// Create a new request to the function
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

		// Send request to function
		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(proxyReq)
		if err != nil {
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

	// List functions handler
	http.HandleFunc("/list", func(w http.ResponseWriter, r *http.Request) {
		// Enable CORS
		enableCors(w, r)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			return
		}

		// Create a copy of the functions map to avoid long lock times
		mutex.RLock()
		functionsCopy := make(map[string]*Function)
		for name, fn := range functions {
			// Create a deep copy of each function
			fnCopy := *fn
			functionsCopy[name] = &fnCopy
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
					if original, exists := functions[fn.Name]; exists {
						original.Running = actuallyRunning
						if !actuallyRunning {
							original.Container = ""
						}
					}
					mutex.Unlock()
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(functionsCopy)
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

		functionName := strings.TrimPrefix(r.URL.Path, "/start/")

		mutex.Lock()
		defer mutex.Unlock()

		function, exists := functions[functionName]
		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
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

		functionName := strings.TrimPrefix(r.URL.Path, "/stop/")

		mutex.Lock()
		defer mutex.Unlock()

		function, exists := functions[functionName]
		if !exists {
			http.Error(w, fmt.Sprintf("Function '%s' not found", functionName), http.StatusNotFound)
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

	// Start server
	port := 8081
	log.Printf("Function Controller starting on port %d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}
