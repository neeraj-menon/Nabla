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

	"github.com/neeraj-menon/Nabla/project-orchestrator/dns"
	"github.com/neeraj-menon/Nabla/project-orchestrator/handlers"
	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
	"github.com/neeraj-menon/Nabla/project-orchestrator/proxy"
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
	Type      string `json:"type"`
	Status    string `json:"status"`
	URL       string `json:"url,omitempty"`       // Internal URL (will be deprecated)
	Port      int    `json:"port,omitempty"`
	PublicURL string `json:"publicUrl,omitempty"` // Public URL via NGINX
	Subdomain string `json:"subdomain,omitempty"` // Subdomain for the service
}

// Global variables
var (
	projectsMutex  sync.RWMutex
	activeProjects = make(map[string]*models.Project)
	nginxConfig    *proxy.NginxConfig
	dnsManager     *dns.DNSManager
)

// initNginxConfig initializes the NGINX configuration manager
func initNginxConfig() {
	configDir := "/app/proxy/nginx/conf"
	nginxConfig = proxy.NewNginxConfig(configDir)
	log.Printf("Initialized NGINX configuration manager with config directory: %s", configDir)
}

// initDNSManager initializes the DNS manager
func initDNSManager() {
	dnsManager = dns.NewDNSManager()
	
	// Ensure the zone file exists
	if err := dnsManager.EnsureZoneFile(); err != nil {
		log.Printf("Warning: failed to ensure zone file: %v", err)
	}
	
	log.Printf("Initialized DNS manager")
}

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

				// Always use directory name as the key to avoid collisions
				projectsMutex.Lock()
				// Store the directory name in the project for reference
				project.Path = projectDir
				
				// Use directory name as the key to avoid collisions with projects that have the same manifest name
				log.Printf("Loading project from directory %s with manifest name %s", projectName, project.Name)
				activeProjects[projectName] = &project
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
		CreatedAt:   project.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   project.UpdatedAt.Format(time.RFC3339),
		Description: project.Manifest.Description,
		Services:    make(map[string]ServiceInfo),
	}

	// Verify container status if project is marked as running
	if project.Status == "running" {
		allRunning := true

		// Check if all service containers are running
		for name, service := range project.Services {
			if service.ContainerID != "" {
				isRunning := handlers.IsContainerRunning(service.ContainerID)
				if !isRunning {
					log.Printf("Service %s container %s is not running", name, service.ContainerID)
					allRunning = false
					// Update service status
					service.Status = "stopped"
					project.Services[name] = service
				}
			}
		}

		// Update project status if any container is not running
		if !allRunning {
			log.Printf("Project %s was marked as running but containers are not running. Updating status.", project.Name)
			response.Status = "stopped"
			// Update the in-memory project status
			project.Status = "stopped"
			// Persist the status change to disk
			go saveProjectStatus(project)
		} else {
			response.Status = "running"
		}
	} else {
		response.Status = project.Status
	}

	// Convert services
	for name, service := range project.Services {
		response.Services[name] = ServiceInfo{
			Type:      service.Type,
			Status:    service.Status,
			URL:       service.URL,
			Port:      service.Port,
			PublicURL: service.PublicURL,
			Subdomain: service.Subdomain,
		}
	}

	return response
}

// CORS middleware to handle cross-origin requests
// saveProjectStatus persists a project's status to disk
func saveProjectStatus(project *models.Project) error {
	// Use project path if available, otherwise use name
	var projectDir string
	if project.Path != "" {
		projectDir = project.Path
	} else {
		projectDir = filepath.Join("./projects", project.Name)
	}
	
	statusFile := filepath.Join(projectDir, "status.json")
	
	// Marshal the project to JSON
	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		log.Printf("Error marshaling project %s: %v", project.Name, err)
		return err
	}
	
	// Write to the status file
	err = os.WriteFile(statusFile, data, 0644)
	if err != nil {
		log.Printf("Error writing status file for project %s: %v", project.Name, err)
		return err
	}
	
	log.Printf("Updated status file for project %s", project.Name)
	return nil
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
	// Initialize NGINX configuration
	initNginxConfig()
	
	// Initialize DNS manager
	initDNSManager()

	// Load existing projects
	loadExistingProjects()

	// Set the NGINX manager in the handlers package
	handlers.SetNginxManager(nginxConfig)
	
	// Set the DNS manager in the handlers package
	handlers.SetDNSManager(dnsManager)

	// Set up logging
	log.SetFlags(log.LstdFlags)
	log.Println("Starting Project Orchestrator service...")

	// Clean up duplicate projects
	CleanupDuplicateProjects()

	// Load existing projects
	loadExistingProjects()

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

	// Create a copy of the projects map to avoid long lock times
	projectsMutex.RLock()
	projectsCopy := make(map[string]*models.Project)
	for name, proj := range activeProjects {
		// Create a deep copy of each project
		projCopy := *proj
		projectsCopy[name] = &projCopy
	}
	projectsMutex.RUnlock()

	// Convert projects to responses with status verification
	projects := make([]ProjectResponse, 0, len(projectsCopy))
	for _, project := range projectsCopy {
		response := projectToResponse(project)
		
		// If status changed, update the original project in the map
		if project.Status != response.Status {
			projectsMutex.Lock()
			if original, exists := activeProjects[project.Name]; exists {
				original.Status = response.Status
				// Also update services status
				for name, service := range project.Services {
					if original.Services[name].Status != service.Status {
						// Need to get the service, update it, then put it back in the map
						updatedService := original.Services[name]
						updatedService.Status = service.Status
						original.Services[name] = updatedService
					}
				}
			}
			projectsMutex.Unlock()
		}
		
		projects = append(projects, response)
	}

	// Return the list of projects
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

// findProject looks up a project by name or directory name
func findProject(projectName string) (*models.Project, string, bool) {
	projectsMutex.RLock()
	defer projectsMutex.RUnlock()
	
	// First try direct lookup by directory name
	project, exists := activeProjects[projectName]
	if exists {
		return project, projectName, true
	}
	
	// If not found, search by manifest name or project name
	for key, p := range activeProjects {
		if p.Name == projectName || (p.Manifest != nil && p.Manifest.Name == projectName) {
			return p, key, true
		}
	}
	
	return nil, "", false
}

// getProjectHandler returns details about a specific project
func getProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	log.Printf("Getting project details for: %s", projectName)

	// Log all available projects for debugging
	log.Printf("Available projects: %v", getProjectNames())

	// Find the project
	project, _, exists := findProject(projectName)

	if !exists {
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Return project details
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projectToResponse(project))
}

// deleteProjectHandler deletes a project
func deleteProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Log the requested project name
	log.Printf("Deleting project: %s", projectName)

	// Log all available projects for debugging
	log.Printf("Available projects: %v", getProjectNames())

	// Find the project
	project, projectKey, exists := findProject(projectName)

	if !exists {
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}

	// Stop and remove all containers
	for name, service := range project.Services {
		if service.ContainerID != "" {
			log.Printf("Stopping container %s for service %s", service.ContainerID, name)
			
			// Stop the container
			stopCmd := exec.Command("docker", "stop", service.ContainerID)
			if err := stopCmd.Run(); err != nil {
				log.Printf("Error stopping container %s: %v", service.ContainerID, err)
			}
			
			// Remove the container
			removeCmd := exec.Command("docker", "rm", "-f", service.ContainerID)
			if err := removeCmd.Run(); err != nil {
				log.Printf("Error removing container %s: %v", service.ContainerID, err)
			}
			
			// Try to remove any associated images based on naming convention
			if service.Type == "api" {
				imageName := fmt.Sprintf("%s-%s:latest", project.Name, name)
				log.Printf("Attempting to remove container image: %s", imageName)
				removeImageCmd := exec.Command("docker", "rmi", "-f", imageName)
				if err := removeImageCmd.Run(); err != nil {
					log.Printf("Error removing image %s: %v (this may be normal if image doesn't exist)", imageName, err)
				}
			}
		}
	}

	// Remove NGINX configurations for all services
	if nginxConfig != nil {
		log.Printf("Removing NGINX configurations for project %s", project.Name)
		for name := range project.Services {
			if err := nginxConfig.DeleteMapping(project.Name, name); err != nil {
				log.Printf("Error removing NGINX mapping for service %s: %v", name, err)
			}
		}
	} else {
		log.Printf("NGINX config not initialized, skipping NGINX cleanup")
	}

	// Remove the project from active projects
	projectsMutex.Lock()
	delete(activeProjects, projectKey)
	projectsMutex.Unlock()

	// Remove project files from disk
	// First check if we have a specific path stored
	var projectDir string
	if project.Path != "" {
		projectDir = project.Path
	} else {
		// Try to find the project directory by searching for it
		entriesDir, err := os.ReadDir("./projects")
		if err == nil {
			for _, entry := range entriesDir {
				if entry.IsDir() {
					dirPath := filepath.Join("./projects", entry.Name())
					statusFile := filepath.Join(dirPath, "status.json")
					
					// Check if this directory has a status.json file for this project
					if _, err := os.Stat(statusFile); err == nil {
						data, err := os.ReadFile(statusFile)
						if err == nil {
							var p models.Project
							if err := json.Unmarshal(data, &p); err == nil {
								if p.Name == project.Name || (p.Manifest != nil && p.Manifest.Name == project.Name) {
									projectDir = dirPath
									break
								}
							}
						}
					}
				}
			}
		}
		
		// If we still don't have a directory, use the project name
		if projectDir == "" {
			projectDir = filepath.Join("./projects", project.Name)
		}
	}

	log.Printf("Removing project directory: %s", projectDir)
	if err := os.RemoveAll(projectDir); err != nil {
		log.Printf("Error removing project directory: %v", err)
		// Continue even if directory removal fails
	}

	// Remove any associated Docker network
	if networkName := fmt.Sprintf("project-%s-network", project.Name); networkName != "" {
		log.Printf("Checking for network: %s", networkName)
		
		// First check if network exists
		checkNetworkCmd := exec.Command("docker", "network", "ls", "--filter", fmt.Sprintf("name=%s", networkName), "--format", "{{.Name}}")
		output, err := checkNetworkCmd.CombinedOutput()
		if err != nil {
			log.Printf("Error checking network %s: %v", networkName, err)
		} else {
			if strings.TrimSpace(string(output)) == networkName {
				log.Printf("Network %s found, attempting to disconnect containers", networkName)
				
				// First disconnect the NGINX container from the network
				disconnectNginxCmd := exec.Command("docker", "network", "disconnect", "--force", networkName, "platform-repository-nginx-1")
				if err := disconnectNginxCmd.Run(); err != nil {
					log.Printf("Note: Could not disconnect NGINX from network %s: %v", networkName, err)
				} else {
					log.Printf("Successfully disconnected NGINX from network %s", networkName)
				}
				
				// Get all containers connected to the network
				listContainersCmd := exec.Command("docker", "network", "inspect", networkName, "--format", "{{range .Containers}}{{.Name}} {{end}}")
				containersOutput, err := listContainersCmd.CombinedOutput()
				if err == nil {
					containers := strings.Fields(string(containersOutput))
					for _, container := range containers {
						log.Printf("Disconnecting container %s from network %s", container, networkName)
						disconnectCmd := exec.Command("docker", "network", "disconnect", "--force", networkName, container)
						if err := disconnectCmd.Run(); err != nil {
							log.Printf("Note: Could not disconnect container %s from network %s: %v", container, networkName, err)
						}
					}
				}
				
				// Now try to remove the network
				removeNetworkCmd := exec.Command("docker", "network", "rm", networkName)
				if err := removeNetworkCmd.Run(); err != nil {
					log.Printf("Error removing network %s: %v", networkName, err)
				} else {
					log.Printf("Successfully removed network %s", networkName)
				}
			} else {
				log.Printf("Network %s does not exist, skipping removal", networkName)
			}
		}
	}

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Project %s and all associated resources have been completely deleted", projectName),
	})
}

// stopProjectHandler stops all services in a project
func stopProjectHandler(w http.ResponseWriter, _ *http.Request, projectName string) {
	// Log the requested project name
	log.Printf("Stopping project: %s", projectName)

	// Log all available projects for debugging
	log.Printf("Available projects: %v", getProjectNames())

	// Find the project
	project, _, exists := findProject(projectName)

	if !exists {
		http.Error(w, fmt.Sprintf("Project %s not found", projectName), http.StatusNotFound)
		return
	}
	
	projectsMutex.Lock()
	// Stop all containers
	for name, service := range project.Services {
		if service.ContainerID != "" {
			log.Printf("Stopping container %s for service %s", service.ContainerID, name)
			exec.Command("docker", "stop", service.ContainerID).Run()
			exec.Command("docker", "rm", service.ContainerID).Run()
			
			// Update service status
			service.Status = "stopped"
			project.Services[name] = service
		}
	}

	// Update project status
	project.Status = "stopped"
	project.UpdatedAt = time.Now()
	projectsMutex.Unlock()

	// Save project status
	saveProjectStatus(project)

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

	// Find the project
	project, _, exists := findProject(projectName)

	if !exists {
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
