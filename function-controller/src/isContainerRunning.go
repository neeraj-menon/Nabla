package main

import (
	"encoding/json"
	"fmt"
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

// isContainerRunning checks if a container is actually running
func isContainerRunning(containerID string) bool {
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

// verifyFunctionStatus checks if a function's container is actually running
// and updates the function status accordingly
func verifyFunctionStatus(function *Function) bool {
	// Check if the container is running
	if function.Container != "" {
		actuallyRunning := isContainerRunning(function.Container)
		
		// If the function is marked as running but the container is not running,
		// update the function status
		if function.Running && !actuallyRunning {
			log.Printf("Function %s was marked as running but container %s is not running. Updating status.",
				function.Name, function.Container)
			function.Running = false
			function.Container = ""
		} else if !function.Running && actuallyRunning {
			// If the function is marked as not running but the container is running,
			// update the function status
			log.Printf("Function %s was marked as not running but container %s is running. Updating status.",
				function.Name, function.Container)
			function.Running = true
		}
		
		return actuallyRunning
	}
	
	return false
}

// getContainerLogs gets the logs from a container
func getContainerLogs(containerID string, lines int) string {
	if containerID == "" {
		return ""
	}
	
	// Use docker logs to get container logs
	var cmd *exec.Cmd
	if lines > 0 {
		cmd = exec.Command("docker", "logs", "--tail", fmt.Sprintf("%d", lines), containerID)
	} else {
		cmd = exec.Command("docker", "logs", containerID)
	}
	
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Printf("Error getting logs for container %s: %v", containerID, err)
		return ""
	}
	
	return string(output)
}
