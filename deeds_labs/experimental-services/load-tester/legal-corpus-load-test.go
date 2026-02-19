//go:build legal_corpus
// +build legal_corpus

// Legal Document Corpus Load Testing
// Stress tests the RabbitMQ + XState workflow with realistic legal documents

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

// Legal document templates for realistic testing
var legalDocumentTemplates = map[string][]string{
	"contract": {
		"This Employment Agreement is entered into between [COMPANY] and [EMPLOYEE] effective [DATE]. The Employee agrees to perform duties including software development, code review, and technical documentation. Compensation shall be $[SALARY] annually, payable bi-weekly. This agreement shall remain in effect for a period of [TERM] years unless terminated earlier in accordance with the provisions herein.",
		"Service Agreement between [PARTY_A] and [PARTY_B] for the provision of consulting services. The Consultant agrees to provide expertise in legal technology, AI implementation, and regulatory compliance. Payment terms: Net 30 days from invoice date. Either party may terminate this agreement with 30 days written notice.",
		"Software License Agreement granting [LICENSEE] a non-exclusive, non-transferable license to use [SOFTWARE] for internal business purposes only. The license fee is $[AMOUNT] annually. Licensee shall not reverse engineer, decompile, or distribute the software without prior written consent.",
	},
	"evidence": {
		"Email correspondence dated [DATE] between [SENDER] and [RECIPIENT] regarding project timeline and deliverables. The email states: 'We need to accelerate the legal AI implementation to meet the Q4 deadline. Please prioritize the RabbitMQ integration and XState workflow testing.' This evidence supports the timeline claims made in the case.",
		"Meeting transcript from [DATE] board meeting discussing contract terms and liability clauses. Present: [ATTENDEES]. Key discussion points included risk allocation, termination provisions, and intellectual property rights. Motion to approve the amended contract passed 7-2.",
		"Financial records showing payment of $[AMOUNT] on [DATE] as evidence of contract performance. Account records indicate regular monthly payments according to the agreed schedule, demonstrating good faith compliance with contractual obligations.",
	},
	"brief": {
		"Plaintiff respectfully submits this Brief in Support of Motion for Summary Judgment. The undisputed facts demonstrate that Defendant breached the software licensing agreement by unauthorized distribution. Legal standard: Summary judgment is appropriate where no genuine issue of material fact exists. See Anderson v. Liberty Lobby, 477 U.S. 242 (1986).",
		"This Brief addresses the question of whether AI-generated legal documents constitute attorney work product under Federal Rule of Civil Procedure 26(b)(3). Recent precedent suggests courts are evolving their interpretation of technology-assisted legal services. The brief argues for protective treatment of AI training data and model outputs.",
		"Motion Brief requesting sanctions for discovery violations. Defendant failed to produce requested RabbitMQ message logs and XState workflow records within the court-ordered deadline. Under Federal Rule 37(b), sanctions are warranted for willful non-compliance with discovery obligations.",
	},
	"citation": {
		"Smith v. Tech Corp., 123 F.3d 456 (9th Cir. 2023) (holding that software licensing agreements must include explicit AI usage provisions); Johnson v. AI Systems, Inc., 456 F. Supp. 3d 789 (S.D.N.Y. 2024) (addressing liability for AI-generated contract terms).",
		"See 17 U.S.C. § 102 (copyright protection for AI-assisted works); Restatement (Third) of Agency § 8.01 (2006) (liability for automated decision systems); Federal Rules of Evidence 702 (admissibility of AI-generated evidence).",
		"For comprehensive analysis, see Legal Technology and Ethics, 45 HARV. L. REV. 123 (2024); AI in Legal Practice: Regulatory Challenges, 78 STAN. L. REV. 456 (2024); Message Queue Architecture in Legal Systems, 12 J. LEGAL TECH. 89 (2024).",
	},
	"discovery": {
		"Request for Production No. 15: All documents and communications relating to the implementation of RabbitMQ message queuing systems between January 1, 2024 and present, including but not limited to: configuration files, deployment logs, error reports, and correspondence with technical vendors.",
		"Interrogatory No. 8: Describe in detail all XState workflow machines used in document processing, including state transitions, error handling procedures, and performance metrics. Identify all personnel involved in design, implementation, and maintenance of these systems.",
		"Request for Admission No. 22: Admit that the legal document processing system utilizes PostgreSQL with pgvector extensions for semantic search capabilities. Admit that Redis is used for caching and pub/sub messaging in addition to RabbitMQ for reliable message queuing.",
	},
}

// Case templates for realistic case IDs
var caseTemplates = []string{
	"CASE-2024-001", "CASE-2024-002", "CASE-2025-001", "CASE-2025-002",
	"LITIGATION-2024-456", "CONTRACT-2024-789", "IP-2025-123",
	"EMPLOYMENT-2024-987", "MERGER-2025-654", "REGULATORY-2024-321",
}

type LegalDocument struct {
	Content      string                 `json:"content"`
	DocumentType string                 `json:"documentType"`
	CaseID       string                 `json:"caseId"`
	Priority     string                 `json:"priority"`
	Metadata     map[string]interface{} `json:"metadata"`
}

type LoadTestConfig struct {
	BaseURL         string
	ConcurrentUsers int
	TestDuration    time.Duration
	RequestRate     time.Duration
	RampUp          bool
	MaxRampUsers    int
	CSVOutput       string
}

type TestResult struct {
	TotalRequests     int
	SuccessfulReqs    int
	FailedReqs        int
	AverageLatency    time.Duration
	P95Latency        time.Duration
	P99Latency        time.Duration
	ErrorRate         float64
	ThroughputRPS     float64
	DocumentTypes     map[string]int
	PriorityDist      map[string]int
}

func generateRealisticDocument() LegalDocument {
	// Randomly select document type
	docTypes := []string{"contract", "evidence", "brief", "citation", "discovery"}
	docType := docTypes[rand.Intn(len(docTypes))]

	// Select random template for this document type
	templates := legalDocumentTemplates[docType]
	template := templates[rand.Intn(len(templates))]

	// Fill in template variables with realistic data
	content := fillTemplateVariables(template)

	// Randomly assign priority based on document type
	priority := assignPriority(docType)

	// Select random case ID
	caseID := caseTemplates[rand.Intn(len(caseTemplates))]

	return LegalDocument{
		Content:      content,
		DocumentType: docType,
		CaseID:       caseID,
		Priority:     priority,
		Metadata: map[string]interface{}{
			"generatedAt":    time.Now().Format(time.RFC3339),
			"testRun":        true,
			"contentLength":  len(content),
			"complexity":     rand.Float64(),
			"jurisdiction":   []string{"Federal", "California", "New York", "Texas"}[rand.Intn(4)],
			"practiceArea":   []string{"Contract", "IP", "Employment", "Litigation", "Corporate"}[rand.Intn(5)],
		},
	}
}

func fillTemplateVariables(template string) string {
	// Simple template variable replacement
	replacements := map[string]string{
		"[COMPANY]":    []string{"TechCorp Inc.", "Legal AI Solutions", "Innovation Labs", "DataFlow Systems"}[rand.Intn(4)],
		"[EMPLOYEE]":   []string{"John Smith", "Sarah Johnson", "Michael Chen", "Lisa Williams"}[rand.Intn(4)],
		"[DATE]":       time.Now().AddDate(0, 0, -rand.Intn(365)).Format("January 2, 2006"),
		"[SALARY]":     fmt.Sprintf("%d,000", 80+rand.Intn(120)),
		"[TERM]":       fmt.Sprintf("%d", 1+rand.Intn(5)),
		"[PARTY_A]":    []string{"Alpha Corp", "Beta LLC", "Gamma Industries", "Delta Partners"}[rand.Intn(4)],
		"[PARTY_B]":    []string{"Consulting Group", "Legal Services", "Technology Partners", "Strategic Advisors"}[rand.Intn(4)],
		"[SOFTWARE]":   "LegalAI Pro",
		"[AMOUNT]":     fmt.Sprintf("$%d,000", 10+rand.Intn(90)),
		"[LICENSEE]":   "Client Organization",
		"[SENDER]":     "legal.team@company.com",
		"[RECIPIENT]":  "development@company.com",
		"[ATTENDEES]":  "Board Members, Legal Counsel, CTO",
	}

	result := template
	for placeholder, value := range replacements {
		result = bytes.NewBuffer([]byte(result)).String()
		result = fmt.Sprintf("%s", bytes.ReplaceAll([]byte(result), []byte(placeholder), []byte(value)))
	}

	return result
}

func assignPriority(docType string) string {
	// Realistic priority distribution based on document type
	switch docType {
	case "discovery":
		// Discovery often has court deadlines - higher priority
		priorities := []string{"high", "urgent", "normal", "normal"}
		return priorities[rand.Intn(len(priorities))]
	case "brief":
		// Briefs usually have filing deadlines - higher priority
		priorities := []string{"high", "urgent", "normal"}
		return priorities[rand.Intn(len(priorities))]
	case "evidence":
		// Evidence processing can be urgent for active litigation
		priorities := []string{"normal", "high", "normal", "low"}
		return priorities[rand.Intn(len(priorities))]
	case "contract":
		// Contracts are usually normal priority unless under negotiation
		priorities := []string{"normal", "normal", "low", "high"}
		return priorities[rand.Intn(len(priorities))]
	case "citation":
		// Citation extraction is typically lower priority
		priorities := []string{"normal", "low", "low", "normal"}
		return priorities[rand.Intn(len(priorities))]
	default:
		return "normal"
	}
}

func submitDocument(baseURL string, doc LegalDocument) (time.Duration, error) {
	startTime := time.Now()

	payload, err := json.Marshal(doc)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal document: %v", err)
	}

	resp, err := http.Post(
		baseURL+"/api/legal/workflow",
		"application/json",
		bytes.NewBuffer(payload),
	)
	if err != nil {
		return 0, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	latency := time.Since(startTime)

	if resp.StatusCode != http.StatusOK {
		return latency, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return latency, nil
}

func runLoadTest(config LoadTestConfig) TestResult {
	fmt.Printf("🚀 Starting Legal Document Corpus Load Test\n")
	fmt.Printf("Target: %s\n", config.BaseURL)
	fmt.Printf("Concurrent Users: %d\n", config.ConcurrentUsers)
	fmt.Printf("Test Duration: %v\n", config.TestDuration)
	fmt.Printf("Ramp Up: %v\n", config.RampUp)
	fmt.Println("Document Types: contract, evidence, brief, citation, discovery")
	fmt.Println("═══════════════════════════════════════════════")

	var wg sync.WaitGroup
	var mu sync.Mutex

	result := TestResult{
		DocumentTypes: make(map[string]int),
		PriorityDist:  make(map[string]int),
	}

	var latencies []time.Duration
	startTime := time.Now()
	endTime := startTime.Add(config.TestDuration)

	// Worker function
	worker := func(workerID int) {
		defer wg.Done()

		for time.Now().Before(endTime) {
			doc := generateRealisticDocument()

			latency, err := submitDocument(config.BaseURL, doc)

			mu.Lock()
			result.TotalRequests++
			latencies = append(latencies, latency)
			result.DocumentTypes[doc.DocumentType]++
			result.PriorityDist[doc.Priority]++

			if err != nil {
				result.FailedReqs++
				fmt.Printf("❌ Worker %d: %v\n", workerID, err)
			} else {
				result.SuccessfulReqs++
				fmt.Printf("✅ Worker %d: %s document (%s priority) - %v\n",
					workerID, doc.DocumentType, doc.Priority, latency)
			}
			mu.Unlock()

			// Rate limiting
			time.Sleep(config.RequestRate)
		}
	}

	// Start workers
	for i := 0; i < config.ConcurrentUsers; i++ {
		wg.Add(1)
		go worker(i + 1)

		// Ramp up delay
		if config.RampUp {
			time.Sleep(time.Duration(1000/config.ConcurrentUsers) * time.Millisecond)
		}
	}

	wg.Wait()

	// Calculate statistics
	totalDuration := time.Since(startTime)
	result.ThroughputRPS = float64(result.TotalRequests) / totalDuration.Seconds()
	result.ErrorRate = float64(result.FailedReqs) / float64(result.TotalRequests) * 100

	if len(latencies) > 0 {
		// Sort latencies for percentile calculation
		for i := 0; i < len(latencies)-1; i++ {
			for j := i + 1; j < len(latencies); j++ {
				if latencies[i] > latencies[j] {
					latencies[i], latencies[j] = latencies[j], latencies[i]
				}
			}
		}

		// Calculate percentiles
		sum := time.Duration(0)
		for _, lat := range latencies {
			sum += lat
		}
		result.AverageLatency = sum / time.Duration(len(latencies))

		p95Index := int(float64(len(latencies)) * 0.95)
		if p95Index < len(latencies) {
			result.P95Latency = latencies[p95Index]
		}

		p99Index := int(float64(len(latencies)) * 0.99)
		if p99Index < len(latencies) {
			result.P99Latency = latencies[p99Index]
		}
	}

	return result
}

func printResults(result TestResult) {
	fmt.Println("\n📊 LEGAL DOCUMENT LOAD TEST RESULTS")
	fmt.Println("═══════════════════════════════════════")
	fmt.Printf("Total Requests:     %d\n", result.TotalRequests)
	fmt.Printf("Successful:         %d\n", result.SuccessfulReqs)
	fmt.Printf("Failed:             %d\n", result.FailedReqs)
	fmt.Printf("Error Rate:         %.2f%%\n", result.ErrorRate)
	fmt.Printf("Throughput:         %.2f RPS\n", result.ThroughputRPS)
	fmt.Printf("Average Latency:    %v\n", result.AverageLatency)
	fmt.Printf("P95 Latency:        %v\n", result.P95Latency)
	fmt.Printf("P99 Latency:        %v\n", result.P99Latency)

	fmt.Println("\n📄 Document Type Distribution:")
	for docType, count := range result.DocumentTypes {
		percentage := float64(count) / float64(result.TotalRequests) * 100
		fmt.Printf("  %s: %d (%.1f%%)\n", docType, count, percentage)
	}

	fmt.Println("\n⚡ Priority Distribution:")
	for priority, count := range result.PriorityDist {
		percentage := float64(count) / float64(result.TotalRequests) * 100
		fmt.Printf("  %s: %d (%.1f%%)\n", priority, count, percentage)
	}
}

func main() {
	var (
		baseURL         = flag.String("url", "http://localhost:5174", "Base URL for the legal workflow API")
		concurrentUsers = flag.Int("users", 5, "Number of concurrent users")
		durationSec     = flag.Int("duration", 60, "Test duration in seconds")
		requestRateMs   = flag.Int("rate", 1000, "Request rate in milliseconds")
		rampUp          = flag.Bool("ramp", true, "Enable ramp-up mode")
		csvOutput       = flag.String("csv", "", "CSV output file for results")
	)
	flag.Parse()

	config := LoadTestConfig{
		BaseURL:         *baseURL,
		ConcurrentUsers: *concurrentUsers,
		TestDuration:    time.Duration(*durationSec) * time.Second,
		RequestRate:     time.Duration(*requestRateMs) * time.Millisecond,
		RampUp:          *rampUp,
		CSVOutput:       *csvOutput,
	}

	// Seed random number generator
	rand.Seed(time.Now().UnixNano())

	result := runLoadTest(config)
	printResults(result)

	// Save CSV if requested
	if config.CSVOutput != "" {
		// CSV export functionality would go here
		fmt.Printf("\n💾 Results would be saved to: %s\n", config.CSVOutput)
	}

	// Overall assessment
	fmt.Println("\n🎯 PERFORMANCE ASSESSMENT:")
	if result.ErrorRate < 5 && result.ThroughputRPS > 10 {
		fmt.Println("✅ EXCELLENT - System handling legal document corpus well")
	} else if result.ErrorRate < 15 && result.ThroughputRPS > 5 {
		fmt.Println("⚠️  GOOD - System stable but could be optimized")
	} else {
		fmt.Println("❌ NEEDS OPTIMIZATION - Consider scaling RabbitMQ or XState workflows")
	}
}