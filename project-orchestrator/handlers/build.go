package handlers

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
)

// BuildHandler handles the building of project components
func BuildHandler(projectDir string, manifest *models.ProjectManifest, userID, username string) (*models.Project, error) {
	log.Printf("Building project %s from directory %s", manifest.Name, projectDir)
	
	// Create a new project object
	project := &models.Project{
		Name:      manifest.Name,
		Path:      projectDir,
		Manifest:  manifest,
		Status:    "building",
		Services:  make(map[string]models.ServiceStatus),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		UserID:    userID,
		Username:  username,
	}
	
	// Build each service
	for name, service := range manifest.Services {
		log.Printf("Building service %s of type %s", name, service.Type)
		
		// Set initial service status
		project.Services[name] = models.ServiceStatus{
			Type:   service.Type,
			Status: "building",
		}
		
		var err error
		
		// Build based on service type
		switch service.Type {
		case "static":
			err = buildStaticService(projectDir, name, service)
		case "api":
			err = buildApiService(projectDir, name, service)
		case "worker":
			err = buildWorkerService(projectDir, name, service)
		default:
			err = fmt.Errorf("unsupported service type: %s", service.Type)
		}
		
		if err != nil {
			log.Printf("Error building service %s: %v", name, err)
			project.Services[name] = models.ServiceStatus{
				Type:   service.Type,
				Status: "failed",
			}
			project.Status = "failed"
			return project, err
		}
		
		// Update service status
		serviceStatus := project.Services[name]
		serviceStatus.Status = "built"
		project.Services[name] = serviceStatus
	}
	
	// If we got here, all services were built successfully
	project.Status = "built"
	return project, nil
}

// buildStaticService builds a static frontend service
func buildStaticService(projectDir string, name string, service models.Service) error {
	// Get absolute path to service directory
	servicePath := filepath.Join(projectDir, service.Path)
	
	// Check if the directory exists
	if _, err := os.Stat(servicePath); os.IsNotExist(err) {
		return fmt.Errorf("service directory %s does not exist", servicePath)
	}
	
	// Check for package.json to determine if this is a Node.js project
	if _, err := os.Stat(filepath.Join(servicePath, "package.json")); err == nil {
		// Install dependencies first
		log.Printf("Installing npm dependencies for %s", name)
		
		// Create the npm install command
		cmd := exec.Command("npm", "install")
		cmd.Dir = servicePath
		
		// Capture stdout and stderr
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		
		// Run the command
		if err := cmd.Run(); err != nil {
			log.Printf("npm install failed: %v", err)
			log.Printf("Stdout: %s", stdout.String())
			log.Printf("Stderr: %s", stderr.String())
			return fmt.Errorf("npm install failed: %v", err)
		}
		
		log.Printf("npm dependencies installed successfully")
	}
	
	// If a build command is specified, run it
	if service.Build != "" {
		log.Printf("Running build command for %s: %s", name, service.Build)
		
		// Split the build command into parts
		cmdParts := strings.Fields(service.Build)
		if len(cmdParts) == 0 {
			return fmt.Errorf("invalid build command: %s", service.Build)
		}
		
		// Create the command
		cmd := exec.Command(cmdParts[0], cmdParts[1:]...)
		cmd.Dir = servicePath
		
		// Capture stdout and stderr
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		
		// Run the command
		if err := cmd.Run(); err != nil {
			log.Printf("Build command failed: %v", err)
			log.Printf("Stdout: %s", stdout.String())
			log.Printf("Stderr: %s", stderr.String())
			return fmt.Errorf("build command failed: %v", err)
		}
		log.Printf("Build command completed successfully")
	}
	
	// Create Dockerfile for the static service
	if err := createStaticDockerfile(projectDir, name, service); err != nil {
		return fmt.Errorf("failed to create Dockerfile: %v", err)
	}
	
	return nil
}

// buildApiService builds an API backend service
func buildApiService(projectDir string, name string, service models.Service) error {
	// Get absolute path to service directory
	servicePath := filepath.Join(projectDir, service.Path)
	
	// Check if the directory exists
	if _, err := os.Stat(servicePath); os.IsNotExist(err) {
		return fmt.Errorf("service directory %s does not exist", servicePath)
	}
	
	// Install dependencies based on runtime
	switch service.Runtime {
	case "python":
		// Check for requirements.txt
		if _, err := os.Stat(filepath.Join(servicePath, "requirements.txt")); err == nil {
			log.Printf("Installing Python dependencies for %s", name)
			
			// Create the pip install command
			cmd := exec.Command("pip", "install", "-r", "requirements.txt")
			cmd.Dir = servicePath
			
			// Capture stdout and stderr
			var stdout, stderr bytes.Buffer
			cmd.Stdout = &stdout
			cmd.Stderr = &stderr
			
			// Run the command
			if err := cmd.Run(); err != nil {
				log.Printf("pip install failed: %v", err)
				log.Printf("Stdout: %s", stdout.String())
				log.Printf("Stderr: %s", stderr.String())
				return fmt.Errorf("pip install failed: %v", err)
			}
			
			log.Printf("Python dependencies installed successfully")
		}
		
		// Create Python Dockerfile
		if err := createPythonDockerfile(projectDir, name, service); err != nil {
			return fmt.Errorf("failed to create Python Dockerfile: %v", err)
		}
		
	case "node":
		// Check for package.json
		if _, err := os.Stat(filepath.Join(servicePath, "package.json")); err == nil {
			log.Printf("Installing Node.js dependencies for %s", name)
			
			// Create the npm install command
			cmd := exec.Command("npm", "install")
			cmd.Dir = servicePath
			
			// Capture stdout and stderr
			var stdout, stderr bytes.Buffer
			cmd.Stdout = &stdout
			cmd.Stderr = &stderr
			
			// Run the command
			if err := cmd.Run(); err != nil {
				log.Printf("npm install failed: %v", err)
				log.Printf("Stdout: %s", stdout.String())
				log.Printf("Stderr: %s", stderr.String())
				return fmt.Errorf("npm install failed: %v", err)
			}
			
			log.Printf("Node.js dependencies installed successfully")
		}
		
		// Create Node.js Dockerfile
		if err := createNodeDockerfile(projectDir, name, service); err != nil {
			return fmt.Errorf("failed to create Node.js Dockerfile: %v", err)
		}
		
	default:
		return fmt.Errorf("unsupported runtime: %s", service.Runtime)
	}
	
	return nil
}

// buildWorkerService builds a background worker service
func buildWorkerService(projectDir string, name string, service models.Service) error {
	// Worker services are similar to API services for now
	return buildApiService(projectDir, name, service)
}

// createStaticDockerfile creates a Dockerfile for a static frontend service
func createStaticDockerfile(projectDir string, _ string, service models.Service) error {
	// Get absolute path to service directory
	servicePath := filepath.Join(projectDir, service.Path)
	
	// Determine the output directory
	outputDir := "build"
	if service.Output != "" {
		outputDir = strings.TrimPrefix(service.Output, "./")
	}
	
	// Check if this is a React/Node.js app with package.json
	_, err := os.Stat(filepath.Join(servicePath, "package.json"))
	isNodeApp := err == nil
	
	// Create a multi-stage Dockerfile for Node.js apps, or a simple one for static files
	var dockerfileContent string
	if isNodeApp {
		// Multi-stage build for React/Node.js apps
		dockerfileContent = fmt.Sprintf(`# Build stage
FROM node:16-alpine as build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy the build output
COPY --from=build /app/%s /usr/share/nginx/html

# Copy nginx configuration if it exists
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]`, outputDir)
	} else {
		// Check if the output directory exists
		outputDirExists := true
		if _, err := os.Stat(filepath.Join(servicePath, outputDir)); os.IsNotExist(err) {
			outputDirExists = false
		}

		// Simple Dockerfile for static files
		if outputDirExists {
			// If the output directory exists, copy from it
			dockerfileContent = fmt.Sprintf(`FROM nginx:alpine
COPY %s /usr/share/nginx/html

# Copy nginx configuration if it exists
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`, outputDir)
		} else {
			// If the output directory doesn't exist, copy everything
			dockerfileContent = `FROM nginx:alpine
COPY . /usr/share/nginx/html

# Copy nginx configuration if it exists
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`
		}
	}
	
	// Write the Dockerfile to the service directory
	dockerfilePath := filepath.Join(servicePath, "Dockerfile")
	if err := os.WriteFile(dockerfilePath, []byte(dockerfileContent), 0644); err != nil {
		return fmt.Errorf("failed to write Dockerfile: %v", err)
	}
	
	// Create a default nginx.conf if needed for SPA routing
	if isNodeApp {
		// Create a comprehensive nginx config for SPA routing with proper CORS and API proxy
		nginxConfig := `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing - redirect all requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
        
        # Basic CORS headers for frontend
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization' always;
    }

    # Proxy API requests to the backend service
    location /api/ {
        # Use the backend service name in the Docker network
        proxy_pass http://project-todo-app-backend:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # CORS headers for API proxy
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization' always;
        
        # Handle OPTIONS method for CORS preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000";
    }
}`
		
		// Write the nginx config to the service directory
		nginxConfigPath := filepath.Join(servicePath, "nginx.conf")
		if err := os.WriteFile(nginxConfigPath, []byte(nginxConfig), 0644); err != nil {
			log.Printf("Warning: failed to write nginx.conf: %v", err)
		}
	}
	
	return nil
}

// createPythonDockerfile creates a Dockerfile for a Python backend service
func createPythonDockerfile(projectDir string, _ string, service models.Service) error {
	// Get absolute path to service directory
	servicePath := filepath.Join(projectDir, service.Path)
	
	// Determine the entrypoint
	entrypoint := "app.py"
	if service.Entrypoint != "" {
		entrypoint = service.Entrypoint
	}
	
	// Determine the port
	port := 5000
	if service.Port != 0 {
		port = service.Port
	}
	
	// Check if we need gunicorn
	useGunicorn := false
	if _, err := os.Stat(filepath.Join(servicePath, "requirements.txt")); err == nil {
		// Check if Flask is in requirements
		requirementsData, err := os.ReadFile(filepath.Join(servicePath, "requirements.txt"))
		if err == nil && (strings.Contains(string(requirementsData), "flask") || strings.Contains(string(requirementsData), "Flask")) {
			useGunicorn = true
		}
	}
	
	// Create the Dockerfile content
	var dockerfileContent string
	if useGunicorn {
		// Flask app with gunicorn for production
		moduleName := strings.TrimSuffix(entrypoint, ".py")
		dockerfileContent = fmt.Sprintf(`FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# Set environment variables for CORS
ENV FLASK_ENV=production
ENV FLASK_APP=%s
ENV FLASK_DEBUG=0

# Copy application code
COPY . .

# Expose the port
EXPOSE %d

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:%d", "%s:app"]`, entrypoint, port, port, moduleName)
	} else {
		// Simple Python app
		dockerfileContent = fmt.Sprintf(`FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set environment variables for CORS
ENV FLASK_ENV=production
ENV FLASK_APP=%s
ENV FLASK_DEBUG=0

# Copy application code
COPY . .

# Expose the port
EXPOSE %d

# Run the application
CMD ["python", "%s"]`, entrypoint, port, entrypoint)
	}
	
	// Write the Dockerfile to the service directory
	dockerfilePath := filepath.Join(servicePath, "Dockerfile")
	if err := os.WriteFile(dockerfilePath, []byte(dockerfileContent), 0644); err != nil {
		return fmt.Errorf("failed to write Dockerfile: %v", err)
	}
	
	return nil
}

// createNodeDockerfile creates a Dockerfile for a Node.js backend service
func createNodeDockerfile(projectDir string, _ string, service models.Service) error {
	// Get absolute path to service directory
	servicePath := filepath.Join(projectDir, service.Path)
	
	// Determine the entrypoint
	entrypoint := "index.js"
	if service.Entrypoint != "" {
		entrypoint = service.Entrypoint
	}
	
	// Determine the port
	port := 3000
	if service.Port != 0 {
		port = service.Port
	}
	
	// Check if this is an Express app
	isExpressApp := false
	if _, err := os.Stat(filepath.Join(servicePath, "package.json")); err == nil {
		// Check if Express is in package.json
		packageData, err := os.ReadFile(filepath.Join(servicePath, "package.json"))
		if err == nil && strings.Contains(string(packageData), "express") {
			isExpressApp = true
		}
	}
	
	// Create the Dockerfile content
	var dockerfileContent string
	if isExpressApp {
		// Express.js app
		dockerfileContent = fmt.Sprintf(`FROM node:16-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose the port
EXPOSE %d

# Run the application
CMD ["node", "%s"]`, port, entrypoint)
	} else {
		// Simple Node.js app
		dockerfileContent = fmt.Sprintf(`FROM node:16-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose the port
EXPOSE %d

# Run the application
CMD ["node", "%s"]`, port, entrypoint)
	}
	
	// Write the Dockerfile to the service directory
	dockerfilePath := filepath.Join(servicePath, "Dockerfile")
	if err := os.WriteFile(dockerfilePath, []byte(dockerfileContent), 0644); err != nil {
		return fmt.Errorf("failed to write Dockerfile: %v", err)
	}
	
	return nil
}
