package models

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v2"
)

// ProjectManifest represents the structure of a project.yaml file
type ProjectManifest struct {
	Name        string                 `yaml:"name"`
	Version     string                 `yaml:"version"`
	Description string                 `yaml:"description,omitempty"`
	Services    map[string]Service     `yaml:"services"`
	Database    *Database              `yaml:"database,omitempty"`
	Environment map[string]string      `yaml:"environment,omitempty"`
	Config      map[string]interface{} `yaml:"config,omitempty"`
}

// Service represents a service within a project (frontend, backend, etc.)
type Service struct {
	Path       string            `yaml:"path"`
	Type       string            `yaml:"type"` // static, api, worker
	Runtime    string            `yaml:"runtime,omitempty"`
	Entrypoint string            `yaml:"entrypoint,omitempty"`
	Build      string            `yaml:"build,omitempty"`
	Output     string            `yaml:"output,omitempty"`
	Port       int               `yaml:"port,omitempty"`
	Route      string            `yaml:"route,omitempty"`
	Env        map[string]string `yaml:"env,omitempty"`
}

// Database represents database configuration
type Database struct {
	Type    string `yaml:"type"` // sqlite, postgres, etc.
	Path    string `yaml:"path,omitempty"`
	Version string `yaml:"version,omitempty"`
}

// Project represents a deployed project
type Project struct {
	Name        string
	Path        string
	Manifest    *ProjectManifest
	Status      string
	Services    map[string]ServiceStatus
	CreatedAt   time.Time
	UpdatedAt   time.Time
	UserID      string                 // User ID of the project owner
	Username    string                 // Username of the project owner
}

// ServiceStatus represents the status of a deployed service
type ServiceStatus struct {
	Type        string
	Status      string
	ContainerID string
	URL         string // Internal URL (will be deprecated in favor of PublicURL)
	Port        int
	PublicURL   string // New field for the public URL (e.g., http://project-service.platform.local)
	Subdomain   string // New field for the subdomain (e.g., project-service.platform.local)
}

// LoadManifest loads a project manifest from a file
func LoadManifest(projectDir string) (*ProjectManifest, error) {
	manifestPath := filepath.Join(projectDir, "project.yaml")
	
	// Check if manifest exists
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		// Try project.yml as an alternative
		manifestPath = filepath.Join(projectDir, "project.yml")
		if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
			return nil, fmt.Errorf("manifest file not found in project directory")
		}
	}
	
	// Read the manifest file
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest file: %v", err)
	}
	
	// Parse the manifest
	var manifest ProjectManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest file: %v", err)
	}
	
	return &manifest, nil
}

// DetectProjectStructure attempts to infer the project structure if no manifest is provided
func DetectProjectStructure(projectDir string) (*ProjectManifest, error) {
	manifest := ProjectManifest{
		Name:     filepath.Base(projectDir),
		Version:  "1.0.0",
		Services: make(map[string]Service),
	}
	
	// Look for common patterns
	
	// Check for frontend (React, Vue, Angular)
	frontendDirs := []string{"frontend", "client", "web", "ui"}
	for _, dir := range frontendDirs {
		frontendPath := filepath.Join(projectDir, dir)
		if _, err := os.Stat(frontendPath); err == nil {
			// Check for package.json
			if _, err := os.Stat(filepath.Join(frontendPath, "package.json")); err == nil {
				manifest.Services["frontend"] = Service{
					Path:  "./" + dir,
					Type:  "static",
					Build: "npm run build",
					Output: "./build", // Default for React
					Route: "/",
				}
				break
			}
		}
	}
	
	// Check for backend (Node, Python, Go)
	backendDirs := []string{"backend", "server", "api"}
	for _, dir := range backendDirs {
		backendPath := filepath.Join(projectDir, dir)
		if _, err := os.Stat(backendPath); err == nil {
			// Check for Python
			if _, err := os.Stat(filepath.Join(backendPath, "requirements.txt")); err == nil {
				// Look for common Python entry points
				entrypoints := []string{"app.py", "main.py", "server.py", "api.py"}
				for _, entry := range entrypoints {
					if _, err := os.Stat(filepath.Join(backendPath, entry)); err == nil {
						manifest.Services["backend"] = Service{
							Path:       "./" + dir,
							Type:       "api",
							Runtime:    "python",
							Entrypoint: entry,
							Port:       5000,
							Route:      "/api",
						}
						break
					}
				}
			}
			
			// Check for Node.js
			if _, err := os.Stat(filepath.Join(backendPath, "package.json")); err == nil {
				entrypoints := []string{"index.js", "server.js", "app.js"}
				for _, entry := range entrypoints {
					if _, err := os.Stat(filepath.Join(backendPath, entry)); err == nil {
						manifest.Services["backend"] = Service{
							Path:       "./" + dir,
							Type:       "api",
							Runtime:    "node",
							Entrypoint: entry,
							Port:       3000,
							Route:      "/api",
						}
						break
					}
				}
			}
			
			// If we found a backend, break
			if _, ok := manifest.Services["backend"]; ok {
				break
			}
		}
	}
	
	// Check for SQLite database
	dbFiles, _ := filepath.Glob(filepath.Join(projectDir, "*.db"))
	if len(dbFiles) > 0 {
		manifest.Database = &Database{
			Type: "sqlite",
			Path: filepath.Base(dbFiles[0]),
		}
	}
	
	// If we didn't find any services, return an error
	if len(manifest.Services) == 0 {
		return nil, fmt.Errorf("could not detect project structure")
	}
	
	return &manifest, nil
}

// SaveManifest saves a project manifest to a file
func SaveManifest(manifest *ProjectManifest, projectDir string) error {
	data, err := yaml.Marshal(manifest)
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %v", err)
	}
	
	manifestPath := filepath.Join(projectDir, "project.yaml")
	if err := os.WriteFile(manifestPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write manifest file: %v", err)
	}
	
	return nil
}
