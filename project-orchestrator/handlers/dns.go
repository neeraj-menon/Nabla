package handlers

import (
	"log"
)

// DNSManager defines the interface for DNS configuration management
type DNSManager interface {
	EnsureZoneFile() error
	UpdateZoneFile() error
	ReloadCoreDNS() error
	AddDNSRecord(name, recordType, value string) error
}

// Global DNS configuration manager
var dnsManager DNSManager

// SetDNSManager sets the DNS configuration manager
func SetDNSManager(manager DNSManager) {
	dnsManager = manager
	log.Printf("DNS manager set in handlers package")
}
