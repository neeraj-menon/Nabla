package proxy

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"
)

// NginxConfig represents the configuration for NGINX
type NginxConfig struct {
	ConfigDir string
}

// ServerConfig represents a server block configuration for a service
type ServerConfig struct {
	ServerName string
	ProxyPass  string
	Port       int
}

// ProjectConfig represents a combined configuration for a project with frontend and backend
type ProjectConfig struct {
	ProjectDomain     string
	FrontendContainer string
	BackendContainer  string
	BackendPort       int
}

// The template for an NGINX server block configuration for individual services
const serverConfigTemplate = `server {
    listen 80;
    server_name {{ .ServerName }};
    
    location / {
        # Use DNS resolver to handle container name resolution across networks
        resolver 127.0.0.11 valid=30s;
        set $upstream {{ .ProxyPass }};
        proxy_pass http://$upstream:{{ .Port }};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}`

// The template for the main project configuration file that combines frontend and backend
const projectConfigTemplate = `server {
    listen 80;
    server_name {{ .ProjectDomain }};
    
    location / {
        # Use DNS resolver to handle container name resolution across networks
        resolver 127.0.0.11 valid=30s;
        set $frontend {{ .FrontendContainer }};
        proxy_pass http://$frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
    
    location /api/ {
        # Use DNS resolver to handle container name resolution across networks
        resolver 127.0.0.11 valid=30s;
        set $backend {{ .BackendContainer }};
        proxy_pass http://$backend:{{ .BackendPort }};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}`

// NewNginxConfig creates a new NGINX configuration manager
func NewNginxConfig(configDir string) *NginxConfig {
	return &NginxConfig{
		ConfigDir: configDir,
	}
}

// GenerateSubdomain generates a subdomain for a service
func GenerateSubdomain(projectName, serviceName string) string {
	// Sanitize project and service names to be DNS-compatible
	projectName = sanitizeName(projectName)
	serviceName = sanitizeName(serviceName)

	return fmt.Sprintf("%s-%s.platform.test", projectName, serviceName)
}

// GenerateProjectDomain generates the main domain for a project
func GenerateProjectDomain(projectName string) string {
	// Sanitize project name to be DNS-compatible
	projectName = sanitizeName(projectName)

	return fmt.Sprintf("%s.platform.test", projectName)
}

// sanitizeName ensures a name is DNS-compatible
func sanitizeName(name string) string {
	// Replace spaces and special characters with dashes
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "-")

	// Remove any character that's not a letter, number, or dash
	var result strings.Builder
	for _, char := range name {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-' {
			result.WriteRune(char)
		}
	}

	return result.String()
}

// ConnectNginxToNetwork connects the NGINX container to a project network
func (nc *NginxConfig) ConnectNginxToNetwork(networkName string) error {
	// First check if the network exists
	cmd := exec.Command("docker", "network", "inspect", networkName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("network %s does not exist: %v", networkName, err)
	}

	// Check if NGINX is already connected to the network
	cmd = exec.Command("docker", "network", "inspect", networkName, "--format", "{{range .Containers}}{{.Name}}{{end}}")
	output, err = cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to inspect network: %v, output: %s", err, string(output))
	}

	// Check if NGINX container is already connected
	if strings.Contains(string(output), "platform-repository-nginx-1") {
		log.Printf("NGINX container already connected to network %s", networkName)
		return nil
	}

	// Connect NGINX container to the network
	cmd = exec.Command("docker", "network", "connect", networkName, "platform-repository-nginx-1")
	output, err = cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to connect NGINX to network: %v, output: %s", err, string(output))
	}

	log.Printf("Connected NGINX container to network %s", networkName)
	return nil
}

// CreateMapping creates an NGINX configuration file for a service
func (nc *NginxConfig) CreateMapping(projectName, serviceName, containerName string, port int) (string, error) {
	subdomain := GenerateSubdomain(projectName, serviceName)
	configFileName := fmt.Sprintf("%s-%s.conf", sanitizeName(projectName), sanitizeName(serviceName))
	configPath := filepath.Join(nc.ConfigDir, configFileName)

	// For static services, we use port 80 internally
	proxyPort := port
	if strings.Contains(serviceName, "frontend") || strings.Contains(serviceName, "static") {
		proxyPort = 80
	}

	// Create server config
	serverConfig := ServerConfig{
		ServerName: subdomain,
		ProxyPass:  containerName,
		Port:       proxyPort,
	}

	// Log the domain being used
	log.Printf("Creating NGINX mapping for domain: %s -> %s:%d", subdomain, containerName, proxyPort)

	// Parse template
	tmpl, err := template.New("server").Parse(serverConfigTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %v", err)
	}

	// Create config file
	file, err := os.Create(configPath)
	if err != nil {
		return "", fmt.Errorf("failed to create config file: %v", err)
	}
	defer file.Close()

	// Execute template
	if err := tmpl.Execute(file, serverConfig); err != nil {
		return "", fmt.Errorf("failed to execute template: %v", err)
	}

	log.Printf("Created NGINX mapping for %s at %s", subdomain, configPath)

	// Create or update the main project configuration file
	if err := nc.createOrUpdateProjectConfig(projectName); err != nil {
		log.Printf("Warning: failed to create/update project config: %v", err)
	}

	// Connect NGINX to the project network
	networkName := fmt.Sprintf("project-%s-network", projectName)
	if err := nc.ConnectNginxToNetwork(networkName); err != nil {
		log.Printf("Warning: failed to connect NGINX to network: %v", err)
	}

	// Reload NGINX
	if err := nc.ReloadNginx(); err != nil {
		log.Printf("Warning: failed to reload NGINX: %v", err)
	}

	return subdomain, nil
}

// createOrUpdateProjectConfig creates or updates the main project configuration file
func (nc *NginxConfig) createOrUpdateProjectConfig(projectName string) error {
	// Generate the main project domain
	projectDomain := GenerateProjectDomain(projectName)
	configFileName := fmt.Sprintf("%s.conf", sanitizeName(projectName))
	configPath := filepath.Join(nc.ConfigDir, configFileName)

	// Determine frontend and backend container names
	frontendContainer := fmt.Sprintf("project-%s-frontend", sanitizeName(projectName))
	backendContainer := fmt.Sprintf("project-%s-backend", sanitizeName(projectName))

	// Create project config
	projectConfig := ProjectConfig{
		ProjectDomain:     projectDomain,
		FrontendContainer: frontendContainer,
		BackendContainer:  backendContainer,
		BackendPort:       5000, // Default backend port
	}

	// Parse template
	tmpl, err := template.New("project").Parse(projectConfigTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse project template: %v", err)
	}

	// Create config file
	file, err := os.Create(configPath)
	if err != nil {
		return fmt.Errorf("failed to create project config file: %v", err)
	}
	defer file.Close()

	// Execute template
	if err := tmpl.Execute(file, projectConfig); err != nil {
		return fmt.Errorf("failed to execute project template: %v", err)
	}

	log.Printf("Created/updated main project NGINX config for %s at %s", projectDomain, configPath)
	return nil
}

// DeleteMapping removes an NGINX configuration file for a service
func (nc *NginxConfig) DeleteMapping(projectName, serviceName string) error {
	// Try multiple possible config file patterns
	possibleConfigFiles := []string{
		fmt.Sprintf("%s-%s.conf", sanitizeName(projectName), sanitizeName(serviceName)),
		"custom-domains.conf",
		"default.conf",
	}

	for _, configFileName := range possibleConfigFiles {
		configPath := filepath.Join(nc.ConfigDir, configFileName)

		// Check if file exists
		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			log.Printf("NGINX config %s does not exist", configPath)
			continue
		}

		// For custom domain configs, we don't want to delete them completely
		// Just update them to remove the project-specific entries
		if configFileName == "custom-domains.conf" || configFileName == "default.conf" {
			log.Printf("Keeping shared config file %s but will update it on next deployment", configPath)
			continue
		}

		// Remove service-specific config files
		log.Printf("Removing NGINX config file: %s", configPath)
		if err := os.Remove(configPath); err != nil {
			log.Printf("Warning: failed to remove config file %s: %v", configPath, err)
		}
	}

	// If this is the last service being deleted, also remove the main project config file
	if serviceName == "frontend" || serviceName == "backend" {
		// Check if the other service config file exists
		otherService := "backend"
		if serviceName == "backend" {
			otherService = "frontend"
		}

		otherConfigFile := fmt.Sprintf("%s-%s.conf", sanitizeName(projectName), otherService)
		otherConfigPath := filepath.Join(nc.ConfigDir, otherConfigFile)

		// If the other service config doesn't exist, remove the main project config
		if _, err := os.Stat(otherConfigPath); os.IsNotExist(err) {
			// Remove the main project config file
			mainConfigFile := fmt.Sprintf("%s.conf", sanitizeName(projectName))
			mainConfigPath := filepath.Join(nc.ConfigDir, mainConfigFile)

			if _, err := os.Stat(mainConfigPath); !os.IsNotExist(err) {
				log.Printf("Removing main project NGINX config file: %s", mainConfigPath)
				if err := os.Remove(mainConfigPath); err != nil {
					log.Printf("Warning: failed to remove main project config file %s: %v", mainConfigPath, err)
				}
			}
		}
	}

	log.Printf("Removed NGINX mapping for %s-%s", projectName, serviceName)

	// Reload NGINX to apply changes
	if err := nc.ReloadNginx(); err != nil {
		log.Printf("Warning: failed to reload NGINX: %v", err)
	}

	return nil
}

// ReloadNginx reloads the NGINX configuration
func (nc *NginxConfig) ReloadNginx() error {
	cmd := exec.Command("docker", "exec", "platform-repository-nginx-1", "nginx", "-s", "reload")
	output, err := cmd.CombinedOutput()

	if err != nil {
		return fmt.Errorf("failed to reload NGINX: %v, output: %s", err, string(output))
	}

	log.Printf("NGINX configuration reloaded successfully")
	return nil
}
