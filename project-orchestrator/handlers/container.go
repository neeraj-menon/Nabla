package handlers

import (
	"encoding/json"
	"log"
	"os/exec"
)

// ContainerState represents the state of a Docker container
type ContainerState struct {
	Running bool `json:"Running"`
}

// ContainerInspect represents the Docker inspect output
type ContainerInspect struct {
	State ContainerState `json:"State"`
}

// IsContainerRunning checks if a container is actually running
func IsContainerRunning(containerID string) bool {
	if containerID == "" {
		return false
	}

	// Use docker inspect to get container status
	cmd := exec.Command("docker", "inspect", containerID)
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Printf("Error inspecting container %s: %v", containerID, err)
		return false
	}
	
	// Parse the JSON output
	var containers []ContainerInspect
	if err := json.Unmarshal(output, &containers); err != nil {
		log.Printf("Error parsing container inspect output: %v", err)
		return false
	}
	
	// Check if container exists and is running
	if len(containers) == 0 {
		log.Printf("Container %s not found", containerID)
		return false
	}
	
	if !containers[0].State.Running {
		log.Printf("Container %s exists but is not running", containerID)
		return false
	}
	
	return true
}
