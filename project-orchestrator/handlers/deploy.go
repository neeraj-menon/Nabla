package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
)

// NginxConfigManager defines the interface for NGINX configuration management
type NginxConfigManager interface {
	CreateMapping(projectName, serviceName, containerName string, port int) (string, error)
	DeleteMapping(projectName, serviceName string) error
}

// Global NGINX configuration manager
var nginxManager NginxConfigManager

// SetNginxManager sets the NGINX configuration manager
func SetNginxManager(manager NginxConfigManager) {
	nginxManager = manager
}

// DeployHandler handles the deployment of a built project
func DeployHandler(project *models.Project) error {
	log.Printf("Deploying project %s", project.Name)
	
	// Update project status
	project.Status = "deploying"
	project.UpdatedAt = time.Now()
	
	// Create a Docker network for the project
	networkName := fmt.Sprintf("project-%s-network", project.Name)
	if err := createDockerNetwork(networkName); err != nil {
		log.Printf("Error creating Docker network: %v", err)
		project.Status = "failed"
		return err
	}
	
	// Ensure DNS zone file is up to date
	if dnsManager != nil {
		if err := dnsManager.EnsureZoneFile(); err != nil {
			log.Printf("Warning: failed to ensure DNS zone file: %v", err)
			// Continue deployment even if DNS setup fails
		}
	}
	
	// Deploy each service
	for name, serviceStatus := range project.Services {
		service := project.Manifest.Services[name]
		
		log.Printf("Deploying service %s of type %s", name, service.Type)
		
		// Update service status
		serviceStatus.Status = "deploying"
		project.Services[name] = serviceStatus
		
		var err error
		var containerId string
		var port int
		
		// Deploy based on service type
		switch service.Type {
		case "static":
			containerId, port, err = deployStaticService(project, name, service, networkName)
		case "api":
			containerId, port, err = deployApiService(project, name, service, networkName)
		case "worker":
			containerId, port, err = deployWorkerService(project, name, service, networkName)
		default:
			err = fmt.Errorf("unsupported service type: %s", service.Type)
		}
		
		if err != nil {
			log.Printf("Error deploying service %s: %v", name, err)
			serviceStatus.Status = "failed"
			project.Services[name] = serviceStatus
			project.Status = "failed"
			return err
		}
		
		// Update service status
		serviceStatus.Status = "running"
		serviceStatus.ContainerID = containerId
		serviceStatus.Port = port
		
		// Set internal URL based on container name and service type
		containerName := fmt.Sprintf("project-%s-%s", project.Name, name)
		if service.Type == "static" {
			serviceStatus.URL = fmt.Sprintf("http://%s", containerName)
		} else if service.Type == "api" {
			serviceStatus.URL = fmt.Sprintf("http://%s%s", containerName, service.Route)
		}
		
		// Create NGINX mapping for the service if NGINX manager is available
		if nginxManager != nil {
			containerName := fmt.Sprintf("project-%s-%s", project.Name, name)
			// For API services, use the container port (typically 5000)
			containerPort := 80
			if service.Type == "api" {
				if service.Port != 0 {
					containerPort = service.Port
				} else {
					containerPort = 5000
				}
			}
			subdomain, err := nginxManager.CreateMapping(project.Name, name, containerName, containerPort)
			if err != nil {
				log.Printf("Warning: failed to create NGINX mapping for service %s: %v", name, err)
			} else {
				// Set public URL and subdomain
				serviceStatus.Subdomain = subdomain
				serviceStatus.PublicURL = fmt.Sprintf("http://%s", subdomain)
				log.Printf("Created public URL for service %s: %s", name, serviceStatus.PublicURL)
			}
		} else {
			log.Printf("NGINX manager not available, skipping public URL creation for service %s", name)
		}
		
		project.Services[name] = serviceStatus
	}
	
	// If we got here, all services were deployed successfully
	project.Status = "running"
	project.UpdatedAt = time.Now()
	
	// Save project status to disk
	if err := saveProjectStatus(project); err != nil {
		log.Printf("Warning: failed to save project status: %v", err)
	}
	
	return nil
}

// createDockerNetwork creates a Docker network for the project
func createDockerNetwork(networkName string) error {
	// Check if network already exists
	cmd := exec.Command("docker", "network", "inspect", networkName)
	if err := cmd.Run(); err == nil {
		// Network already exists
		log.Printf("Network %s already exists", networkName)
		return nil
	}
	
	// Create the network
	cmd = exec.Command("docker", "network", "create", networkName)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create network: %v, stderr: %s", err, stderr.String())
	}
	
	log.Printf("Created Docker network: %s", networkName)
	return nil
}

// deployStaticService deploys a static frontend service
func deployStaticService(project *models.Project, name string, service models.Service, networkName string) (string, int, error) {
	// Get absolute path to service directory
	servicePath := filepath.Join(project.Path, service.Path)
	
	// Build the Docker image
	imageName := fmt.Sprintf("project-%s-%s", project.Name, name)
	if err := buildDockerImage(servicePath, imageName); err != nil {
		return "", 0, fmt.Errorf("failed to build Docker image: %v", err)
	}
	
	// Container port for static services is typically 80
	containerPort := 80
	
	// Run the Docker container with labels for internal routing
	containerName := fmt.Sprintf("project-%s-%s", project.Name, name)
	containerId, err := runDockerContainerWithLabels(
		imageName, 
		containerName, 
		project.Name, 
		name, 
		"static", 
		containerPort, 
		networkName, 
		nil,
	)
	if err != nil {
		return "", 0, fmt.Errorf("failed to run Docker container: %v", err)
	}

	return containerId, containerPort, nil
}

// deployApiService deploys an API backend service
func deployApiService(project *models.Project, name string, service models.Service, networkName string) (string, int, error) {
	// Get absolute path to service directory
	servicePath := filepath.Join(project.Path, service.Path)
	
	// Build the Docker image
	imageName := fmt.Sprintf("project-%s-%s", project.Name, name)
	if err := buildDockerImage(servicePath, imageName); err != nil {
		return "", 0, fmt.Errorf("failed to build Docker image: %v", err)
	}
	
	// Prepare environment variables
	env := make(map[string]string)
	
	// Add service-specific environment variables
	for k, v := range service.Env {
		env[k] = v
	}
	
	// Add project-wide environment variables
	for k, v := range project.Manifest.Environment {
		// Service-specific env vars take precedence
		if _, exists := env[k]; !exists {
			env[k] = v
		}
	}
	
	// Add database connection info if applicable
	if project.Manifest.Database != nil {
		if project.Manifest.Database.Type == "sqlite" {
			dbPath := project.Manifest.Database.Path
			if dbPath != "" {
				env["DATABASE_URL"] = fmt.Sprintf("sqlite:///app/%s", dbPath)
			}
		}
	}
	
	// Determine container port
	containerPort := 5000
	if service.Port != 0 {
		containerPort = service.Port
	}
	
	// Run the Docker container with labels for internal routing
	containerName := fmt.Sprintf("project-%s-%s", project.Name, name)
	containerId, err := runDockerContainerWithLabels(
		imageName, 
		containerName, 
		project.Name, 
		name, 
		"api", 
		containerPort, 
		networkName, 
		env,
	)
	if err != nil {
		return "", 0, fmt.Errorf("failed to run Docker container: %v", err)
	}
	
	return containerId, containerPort, nil
}

// deployWorkerService deploys a background worker service
func deployWorkerService(project *models.Project, name string, service models.Service, networkName string) (string, int, error) {
	// Worker services are similar to API services but don't need port mapping
	// Get absolute path to service directory
	servicePath := filepath.Join(project.Path, service.Path)
	
	// Build the Docker image
	imageName := fmt.Sprintf("project-%s-%s", project.Name, name)
	if err := buildDockerImage(servicePath, imageName); err != nil {
		return "", 0, fmt.Errorf("failed to build Docker image: %v", err)
	}
	
	// Prepare environment variables
	env := make(map[string]string)
	
	// Add service-specific environment variables
	for k, v := range service.Env {
		env[k] = v
	}
	
	// Add project-wide environment variables
	for k, v := range project.Manifest.Environment {
		// Service-specific env vars take precedence
		if _, exists := env[k]; !exists {
			env[k] = v
		}
	}
	
	// Run the Docker container with labels for internal routing
	containerName := fmt.Sprintf("project-%s-%s", project.Name, name)
	containerId, err := runDockerContainerWithLabels(
		imageName, 
		containerName, 
		project.Name, 
		name, 
		"worker", 
		0, // Workers don't expose ports
		networkName, 
		env,
	)
	if err != nil {
		return "", 0, fmt.Errorf("failed to run Docker container: %v", err)
	}
	
	return containerId, 0, nil
}

// buildDockerImage builds a Docker image from a Dockerfile
func buildDockerImage(contextDir string, imageName string) error {
	log.Printf("Building Docker image %s from directory %s", imageName, contextDir)
	
	// Build the Docker image
	cmd := exec.Command("docker", "build", "-t", imageName, ".")
	cmd.Dir = contextDir
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		log.Printf("Docker build output: %s", stdout.String())
		log.Printf("Docker build error: %s", stderr.String())
		return fmt.Errorf("failed to build Docker image: %v", err)
	}
	
	log.Printf("Built Docker image: %s", imageName)
	return nil
}

// cleanupContainer checks if a container exists and removes it if it does
func cleanupContainer(containerName string) error {
	log.Printf("Checking if container %s already exists", containerName)
	
	// Check if the container exists
	cmd := exec.Command("docker", "ps", "-a", "--filter", fmt.Sprintf("name=%s", containerName), "--format", "{{.ID}}")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		log.Printf("Error checking if container exists: %v", err)
		return nil // Continue anyway
	}
	
	containerId := strings.TrimSpace(stdout.String())
	if containerId == "" {
		// Container doesn't exist
		return nil
	}
	
	log.Printf("Container %s already exists with ID %s, stopping and removing", containerName, containerId)
	
	// Stop the container
	stopCmd := exec.Command("docker", "stop", containerId)
	if err := stopCmd.Run(); err != nil {
		log.Printf("Warning: Error stopping container %s: %v", containerName, err)
		// Continue anyway
	}
	
	// Remove the container
	removeCmd := exec.Command("docker", "rm", containerId)
	if err := removeCmd.Run(); err != nil {
		log.Printf("Warning: Error removing container %s: %v", containerName, err)
		return fmt.Errorf("failed to remove existing container: %v", err)
	}
	
	log.Printf("Successfully removed existing container %s", containerName)
	return nil
}

// runDockerContainer runs a Docker container with port mapping
// This is kept for backward compatibility
func runDockerContainer(imageName string, containerName string, hostPort int, containerPort int, networkName string, env map[string]string) (string, error) {
	log.Printf("Running Docker container %s from image %s with port mapping %d:%d", containerName, imageName, hostPort, containerPort)
	
	// Clean up any existing container with the same name
	if err := cleanupContainer(containerName); err != nil {
		return "", err
	}
	
	// Prepare the command
	args := []string{
		"run",
		"-d",
		"--name", containerName,
		"--network", networkName,
		"--restart", "unless-stopped",
	}
	
	// Add port mapping
	args = append(args, "-p", fmt.Sprintf("%d:%d", hostPort, containerPort))
	
	// Add environment variables
	for k, v := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	
	// Add the image name
	args = append(args, imageName)
	
	// Run the container
	cmd := exec.Command("docker", args...)
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		log.Printf("Docker run output: %s", stdout.String())
		log.Printf("Docker run error: %s", stderr.String())
		return "", fmt.Errorf("failed to run Docker container: %v", err)
	}
	
	// Get the container ID
	containerId := strings.TrimSpace(stdout.String())
	log.Printf("Started Docker container: %s (%s)", containerName, containerId)
	
	return containerId, nil
}

// runDockerContainerWithLabels runs a Docker container without host port binding
// but with service discovery labels for internal routing
func runDockerContainerWithLabels(imageName string, containerName string, projectName string, serviceName string, serviceType string, containerPort int, networkName string, env map[string]string) (string, error) {
	log.Printf("Running Docker container %s from image %s with internal routing", containerName, imageName)
	
	// Clean up any existing container with the same name
	if err := cleanupContainer(containerName); err != nil {
		return "", err
	}
	
	// Prepare the command
	args := []string{
		"run",
		"-d",
		"--name", containerName,
		"--network", networkName,
		"--restart", "unless-stopped",
	}
	
	// Add service discovery labels
	args = append(args, 
		"--label", fmt.Sprintf("platform.project=%s", projectName),
		"--label", fmt.Sprintf("platform.service=%s", serviceName),
		"--label", fmt.Sprintf("platform.type=%s", serviceType),
		"--label", fmt.Sprintf("platform.port=%d", containerPort),
	)
	
	// Add environment variables
	for k, v := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	
	// Add the image name
	args = append(args, imageName)
	
	// Run the container
	cmd := exec.Command("docker", args...)
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		log.Printf("Docker run output: %s", stdout.String())
		log.Printf("Docker run error: %s", stderr.String())
		return "", fmt.Errorf("failed to run Docker container: %v", err)
	}
	
	// Get the container ID
	containerId := strings.TrimSpace(stdout.String())
	log.Printf("Started Docker container: %s (%s) with internal routing", containerName, containerId)
	
	return containerId, nil
}

// runDockerContainerWithoutPort runs a Docker container without port mapping (for workers)
func runDockerContainerWithoutPort(imageName string, containerName string, networkName string, env map[string]string) (string, error) {
	log.Printf("Running Docker container %s from image %s (no port mapping)", containerName, imageName)
	
	// Clean up any existing container with the same name
	if err := cleanupContainer(containerName); err != nil {
		return "", err
	}
	
	// Prepare the command
	args := []string{
		"run",
		"-d",
		"--name", containerName,
		"--network", networkName,
		"--restart", "unless-stopped",
	}
	
	// Add environment variables
	for k, v := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	
	// Add the image name
	args = append(args, imageName)
	
	// Run the container
	cmd := exec.Command("docker", args...)
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	if err := cmd.Run(); err != nil {
		log.Printf("Docker run output: %s", stdout.String())
		log.Printf("Docker run error: %s", stderr.String())
		return "", fmt.Errorf("failed to run Docker container: %v", err)
	}
	
	// Get the container ID
	containerId := strings.TrimSpace(stdout.String())
	log.Printf("Started Docker container: %s (%s)", containerName, containerId)
	
	return containerId, nil
}

// findAvailablePort finds an available port in the given range
func findAvailablePort(start, _ int) (int, error) {
	// For now, just return the start port
	// In a production environment, you would check if the port is in use
	return start, nil
}

// saveProjectStatus saves the project status to disk
func saveProjectStatus(project *models.Project) error {
	// Create the status file
	statusFile := filepath.Join(project.Path, "status.json")
	
	// Marshal the project to JSON
	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal project status: %v", err)
	}
	
	// Write the status file
	if err := os.WriteFile(statusFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write status file: %v", err)
	}
	
	return nil
}
