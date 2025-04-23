package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
)

// SaveProjectStatus saves the project status to disk
func SaveProjectStatus(project *models.Project) error {
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
