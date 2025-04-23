package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/neeraj-menon/Nabla/project-orchestrator/handlers"
	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
)

// ProjectResponse represents the API response for a project
type ProjectResponse struct {
	Name        string                 `json:"name"`
	Status      string                 `json:"status"`
	Services    map[string]ServiceInfo `json:"services"`
	CreatedAt   string                 `json:"createdAt"`
	UpdatedAt   string                 `json:"updatedAt"`
	Description string                 `json:"description,omitempty"`
}

// ServiceInfo represents the API response for a service
type ServiceInfo struct {
	Type   string `json:"type"`
	Status string `json:"status"`
	URL    string `json:"url,omitempty"`
	Port   int    `json:"port,omitempty"`
}

// Global variables
var (
	projectsMutex sync.RWMutex
	activeProjects = make(map[string]*models.Project)
)

// processProject handles the building and deployment of a project
func processProject(projectName, projectDir string) {
	log.Printf("Processing project %s in directory %s", projectName, projectDir)

	// Look for project manifest
	manifest, err := models.LoadManifest(projectDir)
	if err != nil {
		log.Printf("No manifest found, attempting to detect project structure: %v", err)
		
		// Try to detect project structure
		manifest, err = models.DetectProjectStructure(projectDir)
		if err != nil {
			log.Printf("Failed to detect project structure: %v", err)
			return
		}
		
		// Save the detected manifest
		if err := models.SaveManifest(manifest, projectDir); err != nil {
			log.Printf("Warning: failed to save detected manifest: %v", err)
		}
	}
	
	// Debug log the manifest name
	log.Printf("Manifest name: %s, Project name: %s", manifest.Name, projectName)
	
	// Use the manifest name as the project name for consistency
	if manifest.Name != "" {
		projectName = manifest.Name
		log.Printf("Using manifest name as project name: %s", projectName)
	}

	// Build the project
	project, err := handlers.BuildHandler(projectDir, manifest)
	if err != nil {
		log.Printf("Error building project: %v", err)
		return
	}

	// Ensure project name is consistent with manifest
	project.Name = manifest.Name
	log.Printf("Setting project name to manifest name: %s", project.Name)

	// Add to active projects using the manifest name as the key
	projectsMutex.Lock()
	activeProjects[project.Name] = project
	projectsMutex.Unlock()
	log.Printf("Added project to activeProjects with key: %s", project.Name)

	// Deploy the project
	if err := handlers.DeployHandler(project); err != nil {
		log.Printf("Error deploying project: %v", err)
		return
	}

	log.Printf("Project %s deployed successfully", projectName)
}

// loadExistingProjects loads projects from the projects directory
func loadExistingProjects() {
	log.Println("Loading existing projects...")
	
	// Get the projects directory
	projectsDir := "./projects"
	
	// List all directories in the projects directory
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		log.Printf("Error reading projects directory: %v", err)
		return
	}
	
	// Process each directory
	for _, entry := range entries {
		if entry.IsDir() {
			projectName := entry.Name()
			projectDir := filepath.Join(projectsDir, projectName)
			
			// Check for status.json
			statusFile := filepath.Join(projectDir, "status.json")
			if _, err := os.Stat(statusFile); err == nil {
				// Read the status file
				data, err := os.ReadFile(statusFile)
				if err != nil {
					log.Printf("Error reading status file for project %s: %v", projectName, err)
					continue
				}
				
				// Parse the status file
				var project models.Project
				if err := json.Unmarshal(data, &project); err != nil {
					log.Printf("Error parsing status file for project %s: %v", projectName, err)
					continue
				}
				
				// Add to active projects using the manifest name as the key for consistency
				projectsMutex.Lock()
				// Only add the project if it has a valid manifest
				if project.Manifest != nil && project.Manifest.Name != "" {
					log.Printf("Using manifest name %s as key instead of directory name %s", project.Manifest.Name, projectName)
					activeProjects[project.Manifest.Name] = &project
				} else {
					// Fall back to directory name if no manifest name is available
					log.Printf("No manifest name found, using directory name %s as key", projectName)
					activeProjects[projectName] = &project
				}
				projectsMutex.Unlock()
				
				log.Printf("Loaded project %s with status %s", project.Name, project.Status)
			}
		}
	}
	
	log.Printf("Loaded %d existing projects", len(activeProjects))
}

// getProjectNames returns a list of all project names
func getProjectNames() []string {
	names := make([]string, 0, len(activeProjects))
	for name := range activeProjects {
		names = append(names, name)
	}
	return names
}

// projectToResponse converts a Project to a ProjectResponse
func projectToResponse(project *models.Project) ProjectResponse {
	response := ProjectResponse{
		Name:        project.Name,
		Status:      project.Status,
		CreatedAt:   project.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   project.UpdatedAt.Format(time.RFC3339),
		Description: project.Manifest.Description,
		Services:    make(map[string]ServiceInfo),
	}
	
	// Convert services
	for name, service := range project.Services {
		response.Services[name] = ServiceInfo{
			Type:   service.Type,
			Status: service.Status,
			URL:    service.URL,
			Port:   service.Port,
		}
	}
	
	return response
}

// CORS middleware to handle cross-origin requests
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Call the next handler
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Set up logging
	log.SetOutput(os.Stdout)
	log.Println("Starting Project Orchestrator service...")

	// Create projects directory if it doesn't exist
	projectsDir := "./projects"
	err := os.MkdirAll(projectsDir, 0755)
	if err != nil {
		log.Fatalf("Failed to create projects directory: %v", err)
	}

	// Load existing projects
	loadExistingProjects()

	// Create router
	router := http.NewServeMux()

	// Set up HTTP routes
	router.HandleFunc("/health", healthCheckHandler)
	router.HandleFunc("/upload", uploadProjectHandler)
	router.HandleFunc("/projects", listProjectsHandler)
	router.HandleFunc("/projects/", projectHandler)

	// Start server with CORS middleware
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}
	log.Printf("Starting server on port %s...", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(router)))
}

// healthCheckHandler returns a simple health check response
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// uploadProjectHandler handles project zip file uploads
func uploadProjectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Use the handlers.UploadHandler
	projectName, projectDir, err := handlers.UploadHandler(w, r)
	if err != nil {
		// Error is already handled by the UploadHandler
		return
	}
	
	// Try to load the manifest to get the actual project name
	manifest, err := models.LoadManifest(projectDir)
	if err == nil && manifest.Name != "" {
		// Check if a project with this manifest name already exists
		projectsMutex.Lock()
		if _, exists := activeProjects[manifest.Name]; exists {
			log.Printf("Project with name %s already exists, removing it before processing new upload", manifest.Name)
			delete(activeProjects, manifest.Name)
		}
		projectsMutex.Unlock()
	}

	// Process the project asynchronously
	go processProject(projectName, projectDir)
}

// listProjectsHandler returns a list of all deployed projects
func listProjectsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get the list of projects
	projectsMutex.RLock()
	projects := make([]ProjectResponse, 0, len(activeProjects))
	for _, project := range activeProjects {
		projects = append(projects, projectToResponse(project))
	}
	projectsMutex.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

// projectHandler handles GET, DELETE, and POST requests for a specific project
func projectHandler(w http.ResponseWriter, r *http.Request) {
	// Extract project name from URL
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "Project name required", http.StatusBadRequest)
		return
	}

	projectName := parts[0]
	
	// Handle different HTTP methods
	switch r.Method {
	case http.MethodGet:
		getProjectHandler(w, r, projectName)
	case http.MethodDelete:
		deleteProjectHandler(w, r, projectName)
	case http.MethodPost:
		// Check for action in the URL path
		if len(parts) > 1 && parts[1] == "stop" {
			stopProjectHandler(w, r, projectName)
		} else if len(parts) > 1 && parts[1] == "start" {
			startProjectHandler(w, r, projectName)
		} else {
			http.Error(w, "Invalid action", http.StatusBadRequest)
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getProjectHandler returns details about a specific project
func getProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Log the requested project name
	log.Printf("Getting project details for: %s", projectName)
	
	// Log all available projects for debugging
	projectsMutex.RLock()
	log.Printf("Available projects: %v", getProjectNames())
	project, exists := activeProjects[projectName]
	projectsMutex.RUnlock()

	if !exists {
		log.Printf("Project %s not found in activeProjects map", projectName)
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Return project details
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projectToResponse(project))
}

// deleteProjectHandler deletes a project
func deleteProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Get the project
	projectsMutex.RLock()
	project, exists := activeProjects[projectName]
	projectsMutex.RUnlock()

	if !exists {
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Stop all containers
	for name, service := range project.Services {
		if service.ContainerID != "" {
			log.Printf("Stopping container %s for service %s", service.ContainerID, name)
			exec.Command("docker", "stop", service.ContainerID).Run()
			exec.Command("docker", "rm", service.ContainerID).Run()
		}
	}

	// Remove the project from active projects
	projectsMutex.Lock()
	delete(activeProjects, projectName)
	projectsMutex.Unlock()

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Project %s deleted", projectName),
	})
}

// stopProjectHandler stops all services in a project
func stopProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Log the requested project name
	log.Printf("Stopping project: %s", projectName)
	
	// Log all available projects for debugging
	log.Printf("Available projects: %v", getProjectNames())
	
	// Get the project
	projectsMutex.Lock()
	project, exists := activeProjects[projectName]
	if !exists {
		projectsMutex.Unlock()
		log.Printf("Project %s not found in activeProjects map", projectName)
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Stop all containers
	for name, service := range project.Services {
		if service.ContainerID != "" {
			log.Printf("Stopping container %s for service %s", service.ContainerID, name)
			exec.Command("docker", "stop", service.ContainerID).Run()
			
			// Update service status
			service.Status = "stopped"
			project.Services[name] = service
		}
	}

	// Update project status
	project.Status = "stopped"
	project.UpdatedAt = time.Now()

	// Save project status
	handlers.SaveProjectStatus(project)

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projectToResponse(project))
}

// startProjectHandler starts all services in a project
func startProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Log the requested project name
	log.Printf("Starting project: %s", projectName)
	
	// Log all available projects for debugging
	log.Printf("Available projects: %v", getProjectNames())
	
	// Get the project
	projectsMutex.RLock()
	project, exists := activeProjects[projectName]
	projectsMutex.RUnlock()

	if !exists {
		log.Printf("Project %s not found in activeProjects map", projectName)
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Start deployment in a goroutine
	go func() {
		if err := handlers.DeployHandler(project); err != nil {
			log.Printf("Error deploying project %s: %v", projectName, err)
		}
	}()

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Project %s deployment started", projectName),
	})
}
