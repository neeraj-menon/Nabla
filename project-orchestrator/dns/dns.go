package dns

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// DNSManager handles CoreDNS configuration
type DNSManager struct {
	ZonesDir string
	ZoneFile string
}

// NewDNSManager creates a new DNS manager
func NewDNSManager() *DNSManager {
	return &DNSManager{
		ZonesDir: "/app/dns/zones",
		ZoneFile: "/app/dns/zones/platform.test.zone",
	}
}

// EnsureZoneFile ensures the zone file exists and is up to date
func (dm *DNSManager) EnsureZoneFile() error {
	// Check if zone file exists
	if _, err := os.Stat(dm.ZoneFile); os.IsNotExist(err) {
		log.Printf("Zone file does not exist, creating it")
		
		// Create zones directory if it doesn't exist
		if err := os.MkdirAll(dm.ZonesDir, 0755); err != nil {
			return fmt.Errorf("failed to create zones directory: %v", err)
		}
		
		// Create the zone file with default content
		zoneContent := fmt.Sprintf(`$ORIGIN platform.test.
@   3600 IN SOA ns.platform.test. admin.platform.test. (
        %d ; serial
        7200       ; refresh
        3600       ; retry
        1209600    ; expire
        3600 )     ; minimum

    IN NS ns.platform.test.
ns  IN A 127.0.0.1
*   IN A 127.0.0.1
`, time.Now().Unix())
		
		if err := os.WriteFile(dm.ZoneFile, []byte(zoneContent), 0644); err != nil {
			return fmt.Errorf("failed to create zone file: %v", err)
		}
		
		log.Printf("Created zone file: %s", dm.ZoneFile)
	}
	
	return nil
}

// UpdateZoneFile updates the zone file with a new serial number
func (dm *DNSManager) UpdateZoneFile() error {
	// Read the current zone file
	content, err := os.ReadFile(dm.ZoneFile)
	if err != nil {
		return fmt.Errorf("failed to read zone file: %v", err)
	}
	
	// Update the serial number
	lines := strings.Split(string(content), "\n")
	for i, line := range lines {
		if strings.Contains(line, "serial") {
			// Extract the current serial number
			parts := strings.Split(line, ";")
			if len(parts) > 0 {
				// Replace with current timestamp
				lines[i] = fmt.Sprintf("        %d ; serial", time.Now().Unix())
				break
			}
		}
	}
	
	// Write the updated content back to the file
	updatedContent := strings.Join(lines, "\n")
	if err := os.WriteFile(dm.ZoneFile, []byte(updatedContent), 0644); err != nil {
		return fmt.Errorf("failed to update zone file: %v", err)
	}
	
	log.Printf("Updated zone file with new serial number")
	return nil
}

// ReloadCoreDNS is now a no-op since we're using dnsmasq directly
func (dm *DNSManager) ReloadCoreDNS() error {
	// No need to reload CoreDNS as we're using dnsmasq
	log.Printf("Using dnsmasq for DNS resolution, no need to reload CoreDNS")
	return nil
}

// AddDNSRecord adds a specific DNS record to the zone file (for future use)
func (dm *DNSManager) AddDNSRecord(name, recordType, value string) error {
	// Read the current zone file
	content, err := os.ReadFile(dm.ZoneFile)
	if err != nil {
		return fmt.Errorf("failed to read zone file: %v", err)
	}
	
	// Check if the record already exists
	record := fmt.Sprintf("%s IN %s %s", name, recordType, value)
	if strings.Contains(string(content), record) {
		log.Printf("DNS record already exists: %s", record)
		return nil
	}
	
	// Add the record to the zone file
	lines := strings.Split(string(content), "\n")
	var updatedLines []string
	
	// Find the position to insert the new record (after the SOA and NS records)
	insertPos := len(lines)
	for i, line := range lines {
		if strings.Contains(line, "IN A 127.0.0.1") && strings.HasPrefix(line, "*") {
			insertPos = i + 1
			break
		}
		updatedLines = append(updatedLines, line)
	}
	
	// Insert the new record
	updatedLines = append(updatedLines, record)
	
	// Add the remaining lines
	if insertPos < len(lines) {
		updatedLines = append(updatedLines, lines[insertPos:]...)
	}
	
	// Write the updated content back to the file
	updatedContent := strings.Join(updatedLines, "\n")
	if err := os.WriteFile(dm.ZoneFile, []byte(updatedContent), 0644); err != nil {
		return fmt.Errorf("failed to update zone file: %v", err)
	}
	
	// Update the serial number
	if err := dm.UpdateZoneFile(); err != nil {
		return err
	}
	
	// Reload CoreDNS
	if err := dm.ReloadCoreDNS(); err != nil {
		return err
	}
	
	log.Printf("Added DNS record: %s", record)
	return nil
}
