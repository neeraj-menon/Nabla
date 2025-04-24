package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/neeraj-menon/Nabla/project-orchestrator/models"
)

// CleanupDuplicateProjects removes duplicate projects with the same manifest name
func CleanupDuplicateProjects() {
	log.Println("Cleaning up duplicate projects...")

	// Get the projects directory
	projectsDir := "./projects"

	// Create a map to track unique projects by manifest name
	uniqueProjects := make(map[string][]string) // manifest name -> list of directory paths

	// List all directories in the projects directory
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		log.Printf("Error reading projects directory: %v", err)
		return
	}

	// First pass: collect all projects by manifest name
	for _, entry := range entries {
		if entry.IsDir() {
			dirName := entry.Name()
			projectDir := filepath.Join(projectsDir, dirName)

			// Check for status.json
			statusFile := filepath.Join(projectDir, "status.json")
			if _, err := os.Stat(statusFile); err == nil {
				// Read the status file
				data, err := os.ReadFile(statusFile)
				if err != nil {
					log.Printf("Error reading status file for project %s: %v", dirName, err)
					continue
				}

				// Parse the status file
				var project models.Project
				if err := json.Unmarshal(data, &project); err != nil {
					log.Printf("Error parsing status file for project %s: %v", dirName, err)
					continue
				}

				// Get the manifest name
				manifestName := dirName
				if project.Manifest != nil && project.Manifest.Name != "" {
					manifestName = project.Manifest.Name
				}

				// Add to the unique projects map
				uniqueProjects[manifestName] = append(uniqueProjects[manifestName], projectDir)
			}
		}
	}

	// Second pass: keep only the most recently updated project for each manifest name
	for manifestName, projectDirs := range uniqueProjects {
		if len(projectDirs) <= 1 {
			continue // No duplicates
		}

		log.Printf("Found %d duplicate projects with manifest name %s", len(projectDirs), manifestName)

		// Find the most recently updated project
		var mostRecentProject string
		var mostRecentTime time.Time

		for _, projectDir := range projectDirs {
			statusFile := filepath.Join(projectDir, "status.json")
			data, err := os.ReadFile(statusFile)
			if err != nil {
				continue
			}

			var project models.Project
			if err := json.Unmarshal(data, &project); err != nil {
				continue
			}

			if mostRecentProject == "" || project.UpdatedAt.After(mostRecentTime) {
				mostRecentProject = projectDir
				mostRecentTime = project.UpdatedAt
			}
		}

		// Delete all other projects
		for _, projectDir := range projectDirs {
			if projectDir != mostRecentProject {
				dirName := filepath.Base(projectDir)
				log.Printf("Removing duplicate project directory: %s", dirName)
				if err := os.RemoveAll(projectDir); err != nil {
					log.Printf("Error removing project directory %s: %v", dirName, err)
				}
			}
		}
	}

	log.Println("Cleanup of duplicate projects completed")
}

// GetUniqueProjectName generates a unique directory name for a project
func GetUniqueProjectName(baseName string) string {
	// Clean the base name to be filesystem-friendly
	baseName = strings.ReplaceAll(baseName, " ", "-")
	baseName = strings.ToLower(baseName)
	
	// Check if the directory already exists
	projectsDir := "./projects"
	projectDir := filepath.Join(projectsDir, baseName)
	
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return baseName // Directory doesn't exist, we can use this name
	}
	
	// Directory exists, add a timestamp suffix
	timestamp := time.Now().Format("20060102-150405")
	return baseName + "-" + timestamp
}
