package handlers

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// UploadHandler handles project zip file uploads
func UploadHandler(w http.ResponseWriter, r *http.Request) (string, string, error) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return "", "", fmt.Errorf("method not allowed")
	}

	// Parse the multipart form, 32 MB max
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		log.Printf("Error parsing form: %v", err)
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return "", "", fmt.Errorf("error parsing form: %v", err)
	}

	// Get the file from the form
	file, handler, err := r.FormFile("project")
	if err != nil {
		log.Printf("Error getting file: %v", err)
		http.Error(w, "Error getting file", http.StatusBadRequest)
		return "", "", fmt.Errorf("error getting file: %v", err)
	}
	defer file.Close()

	log.Printf("Received file: %s, size: %d bytes", handler.Filename, handler.Size)

	// Create a timestamp-based project name if not provided
	projectName := r.FormValue("name")
	if projectName == "" {
		// Use the filename without extension as project name
		projectName = strings.TrimSuffix(handler.Filename, filepath.Ext(handler.Filename))
		// Sanitize the project name
		projectName = sanitizeProjectName(projectName)
		// Add timestamp to ensure uniqueness
		projectName = fmt.Sprintf("%s-%d", projectName, time.Now().Unix())
	}

	// Create project directory
	projectDir := filepath.Join("projects", projectName)
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		log.Printf("Error creating project directory: %v", err)
		http.Error(w, "Error creating project directory", http.StatusInternalServerError)
		return "", "", fmt.Errorf("error creating project directory: %v", err)
	}

	// Save the zip file temporarily
	tempZipPath := filepath.Join(projectDir, "upload.zip")
	tempFile, err := os.Create(tempZipPath)
	if err != nil {
		log.Printf("Error creating temp file: %v", err)
		http.Error(w, "Error saving uploaded file", http.StatusInternalServerError)
		return "", "", fmt.Errorf("error creating temp file: %v", err)
	}
	defer tempFile.Close()

	// Copy the file data to the temp file
	if _, err := io.Copy(tempFile, file); err != nil {
		log.Printf("Error copying file data: %v", err)
		http.Error(w, "Error saving uploaded file", http.StatusInternalServerError)
		return "", "", fmt.Errorf("error copying file data: %v", err)
	}

	// Extract the zip file
	if err := extractZip(tempZipPath, projectDir); err != nil {
		log.Printf("Error extracting zip: %v", err)
		http.Error(w, "Error extracting zip file", http.StatusInternalServerError)
		return "", "", fmt.Errorf("error extracting zip: %v", err)
	}

	// Remove the temporary zip file
	if err := os.Remove(tempZipPath); err != nil {
		log.Printf("Warning: could not remove temporary zip file: %v", err)
	}

	// TODO: Analyze project structure
	// TODO: Build and deploy the project

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"success","message":"Project %s uploaded and extracted successfully","projectName":"%s"}`, projectName, projectName)
	
	return projectName, projectDir, nil
}

// extractZip extracts a zip file to the specified destination
func extractZip(zipPath, destPath string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer reader.Close()

	// Create destination directory if it doesn't exist
	if err := os.MkdirAll(destPath, 0755); err != nil {
		return err
	}

	// Check if the zip has a single root directory
	hasRootDir := false
	rootDirName := ""

	// Count directories at the root level
	rootDirs := make(map[string]bool)
	for _, file := range reader.File {
		parts := strings.Split(file.Name, "/")
		if len(parts) > 0 && parts[0] != "" {
			rootDirs[parts[0]] = true
		}
	}

	// If there's only one root directory, extract its contents directly
	if len(rootDirs) == 1 {
		for dir := range rootDirs {
			rootDirName = dir
			break
		}
		hasRootDir = true
		log.Printf("ZIP has a single root directory: %s, extracting contents directly", rootDirName)
	}

	// Extract each file
	for _, file := range reader.File {
		// Skip the root directory itself
		if hasRootDir && file.Name == rootDirName+"/" {
			continue
		}

		// Determine the target path
		var targetPath string
		if hasRootDir {
			// Remove the root directory from the path
			relPath := strings.TrimPrefix(file.Name, rootDirName+"/")
			if relPath == "" {
				continue // Skip the root directory
			}
			targetPath = filepath.Join(destPath, relPath)
		} else {
			targetPath = filepath.Join(destPath, file.Name)
		}

		// Ensure the file path is safe (no directory traversal)
		if !strings.HasPrefix(targetPath, filepath.Clean(destPath)+string(os.PathSeparator)) {
			return fmt.Errorf("invalid file path: %s", file.Name)
		}

		if file.FileInfo().IsDir() {
			// Create directory
			if err := os.MkdirAll(targetPath, file.Mode()); err != nil {
				return err
			}
			continue
		}

		// Create parent directory if it doesn't exist
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		// Create file
		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			return err
		}

		// Open the file in the zip
		rc, err := file.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		// Copy the file content
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}

	return nil
}

// sanitizeProjectName removes special characters from project name
func sanitizeProjectName(name string) string {
	// Replace spaces and special characters with underscores
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, name)
	
	// Ensure it starts with a letter or number
	if len(name) > 0 && !((name[0] >= 'a' && name[0] <= 'z') || (name[0] >= 'A' && name[0] <= 'Z') || (name[0] >= '0' && name[0] <= '9')) {
		name = "project_" + name
	}
	
	return name
}
