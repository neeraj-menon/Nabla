package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
	"github.com/gorilla/mux"
)

// Configuration variables
var (
	functionNetwork = os.Getenv("FUNCTION_NETWORK")
	proxyPort       = os.Getenv("PROXY_PORT")
	discoveryLabels = os.Getenv("DISCOVERY_LABELS")
	containerPortLabel = os.Getenv("CONTAINER_PORT_LABEL")
	dockerClient    *client.Client
	functionCache   = make(map[string]string) // Maps function name to container ID
	cacheMutex      = &sync.RWMutex{}
	labelsList      []string // List of labels to use for discovery
)

func init() {
	// Set default values if environment variables are not set
	if functionNetwork == "" {
		// Use the Docker Compose prefixed network name
		functionNetwork = "platform-repository_function-network"
	}
	if proxyPort == "" {
		proxyPort = "8090"
	}
	
	// Set up discovery labels
	if discoveryLabels == "" {
		discoveryLabels = "platform.service,function"
	}
	labelsList = strings.Split(discoveryLabels, ",")
	
	// Set default container port label
	if containerPortLabel == "" {
		containerPortLabel = "platform.port"
	}

	// Initialize Docker client
	var err error
	dockerClient, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Failed to create Docker client: %v", err)
	}

	log.Printf("Reverse proxy initialized with function network: %s, proxy port: %s", functionNetwork, proxyPort)
}

// CORS middleware to allow cross-origin requests
func enableCors(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
	}
}

// getFunctionContainer finds the container ID for a given function name
func getFunctionContainer(functionName string) (string, error) {
	// Check cache first
	cacheMutex.RLock()
	containerID, exists := functionCache[functionName]
	cacheMutex.RUnlock()

	if exists {
		// Verify container still exists and is running
		container, err := dockerClient.ContainerInspect(context.Background(), containerID)
		if err == nil && container.State.Running {
			return containerID, nil
		}
		// If not running or error, remove from cache
		cacheMutex.Lock()
		delete(functionCache, functionName)
		cacheMutex.Unlock()
	}

	// Try each discovery label in order
	var containers []types.Container
	var lastErr error
	
	for _, labelKey := range labelsList {
		args := filters.NewArgs()
		args.Add("label", fmt.Sprintf("%s=%s", labelKey, functionName))
		
		containerList, err := dockerClient.ContainerList(context.Background(), types.ContainerListOptions{
			Filters: args,
		})
		
		if err != nil {
			lastErr = err
			continue
		}
		
		if len(containerList) > 0 {
			containers = containerList
			break
		}
	}
	
	// If we have an error and no containers, return the error
	if len(containers) == 0 && lastErr != nil {
		return "", lastErr
	}

	// No need to check for err here as we've already handled it above

	if len(containers) == 0 {
		return "", fmt.Errorf("no container found for function: %s", functionName)
	}

	// Update cache
	containerID = containers[0].ID
	cacheMutex.Lock()
	functionCache[functionName] = containerID
	cacheMutex.Unlock()

	return containerID, nil
}

// proxyRequest forwards the request to the function container
func proxyRequest(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	enableCors(w, r)
	if r.Method == "OPTIONS" {
		return
	}

	// Extract function name from path
	vars := mux.Vars(r)
	functionName := vars["function"]
	path := vars["path"]
	if path == "" {
		path = "/"
	} else {
		path = "/" + path
	}

	log.Printf("Proxying request to function: %s, path: %s", functionName, path)

	// Get container ID for the function
	containerID, err := getFunctionContainer(functionName)
	if err != nil {
		log.Printf("Error finding container for function %s: %v", functionName, err)
		http.Error(w, fmt.Sprintf("Function not found or not running: %v", err), http.StatusNotFound)
		return
	}

	// Get container details to find IP address
	container, err := dockerClient.ContainerInspect(context.Background(), containerID)
	if err != nil {
		log.Printf("Error inspecting container %s: %v", containerID, err)
		http.Error(w, "Error accessing function container", http.StatusInternalServerError)
		return
	}

	// Get container IP address in the function network
	networkSettings := container.NetworkSettings.Networks[functionNetwork]
	if networkSettings == nil {
		log.Printf("Container %s is not connected to network %s", containerID, functionNetwork)
		http.Error(w, "Function container not properly networked", http.StatusInternalServerError)
		return
	}

	containerIP := networkSettings.IPAddress
	if containerIP == "" {
		log.Printf("Container %s has no IP address in network %s", containerID, functionNetwork)
		http.Error(w, "Function container has no IP address", http.StatusInternalServerError)
		return
	}

	// Determine container port from label or use default
	containerPort := "8080"
	// Inspect the container to get all labels
	containerInfo, err := dockerClient.ContainerInspect(context.Background(), containerID)
	if err == nil && containerInfo.Config != nil {
		if portLabel, exists := containerInfo.Config.Labels[containerPortLabel]; exists && portLabel != "0" {
			containerPort = portLabel
		}
	}
	
	// Build target URL
	targetURL := fmt.Sprintf("http://%s:%s%s", containerIP, containerPort, path)
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	log.Printf("Forwarding to: %s", targetURL)

	// Create a new request
	proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		log.Printf("Error creating proxy request: %v", err)
		http.Error(w, "Error creating proxy request", http.StatusInternalServerError)
		return
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Send the request to the function container with increased timeout
	client := &http.Client{
		Timeout: 20 * time.Second,
		// Add a transport with more aggressive timeouts
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   5 * time.Second,
			ResponseHeaderTimeout: 10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			MaxIdleConns:          100,
			IdleConnTimeout:       90 * time.Second,
		},
	}

	log.Printf("Sending request to function container at %s", targetURL)
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("Error forwarding request to function container: %v", err)
		
		// Check if it's a timeout error
		if os.IsTimeout(err) || strings.Contains(err.Error(), "timeout") {
			http.Error(w, fmt.Sprintf("Function timed out: %v", err), http.StatusGatewayTimeout)
		} else {
			http.Error(w, fmt.Sprintf("Error invoking function: %v", err), http.StatusInternalServerError)
		}
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
}

// healthCheck endpoint
func healthCheck(w http.ResponseWriter, r *http.Request) {
	enableCors(w, r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

// listFunctions endpoint - lists all function containers
func listFunctions(w http.ResponseWriter, r *http.Request) {
	enableCors(w, r)
	w.Header().Set("Content-Type", "application/json")

	// Get all containers with any of our discovery labels
	var allContainers []types.Container
	
	for _, labelKey := range labelsList {
		args := filters.NewArgs()
		args.Add("label", labelKey)
		
		containerList, err := dockerClient.ContainerList(context.Background(), types.ContainerListOptions{
			Filters: args,
		})
		
		if err == nil && len(containerList) > 0 {
			allContainers = append(allContainers, containerList...)
		}
	}
	
	// Deduplicate containers by ID
	containerMap := make(map[string]types.Container)
	for _, container := range allContainers {
		containerMap[container.ID] = container
	}
	
	// Convert back to slice
	containers := make([]types.Container, 0, len(containerMap))
	for _, container := range containerMap {
		containers = append(containers, container)
	}

	// Format response
	functions := make([]map[string]interface{}, 0)
	for _, container := range containers {
		functionName := ""
		
		// Check each discovery label in order
		for _, labelKey := range labelsList {
			if name, exists := container.Labels[labelKey]; exists {
				functionName = name
				break
			}
		}

		if functionName != "" {
			functions = append(functions, map[string]interface{}{
				"name":      functionName,
				"container": container.ID[:12],
				"image":     container.Image,
				"running":   container.State == "running",
				"created":   container.Created,
			})
		}
	}

	json.NewEncoder(w).Encode(functions)
}

func main() {
	r := mux.NewRouter()

	// Health check endpoint
	r.HandleFunc("/health", healthCheck).Methods("GET", "OPTIONS")

	// List functions endpoint
	r.HandleFunc("/functions", listFunctions).Methods("GET", "OPTIONS")

	// Proxy endpoint for function invocation
	r.HandleFunc("/function/{function}", proxyRequest).Methods("GET", "POST", "PUT", "DELETE", "OPTIONS")
	r.HandleFunc("/function/{function}/{path:.*}", proxyRequest).Methods("GET", "POST", "PUT", "DELETE", "OPTIONS")

	// Start server
	log.Printf("Starting reverse proxy server on port %s", proxyPort)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", proxyPort), r); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
