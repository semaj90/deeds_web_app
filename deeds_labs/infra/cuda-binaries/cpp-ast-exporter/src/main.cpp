#include <iostream>
#include <string>
#include "httplib.h"

int main() {
    // Create an HTTP client
    httplib::Client cli("localhost", 8095);

    // Define the JSON to be sent
    std::string json_to_parse = R"({
        "id": "doc-123",
        "title": "Test Document",
        "content": "This is a test document for the HTTP fallback parser.",
        "metadata": {
            "document_type": "test",
            "jurisdiction": "federal",
            "court_level": "supreme",
            "case_number": "2025-001",
            "filing_date": "2025-11-10T10:00:00Z",
            "parties": [],
            "practice_areas": ["testing"],
            "tags": ["http", "fallback"],
            "risk_level": "low",
            "custom_fields": {}
        },
        "entities": [],
        "citations": [],
        "confidence": 0.99
    })";

    // Send a POST request to the /api/v1/parse/document endpoint
    std::cout << "Sending JSON to http://localhost:8095/api/v1/parse/document..." << std::endl;
    auto res = cli.Post("/api/v1/parse/document", json_to_parse, "application/json");

    // Check the result
    if (res) {
        std::cout << "Status: " << res->status << std::endl;
        std::cout << "Headers:" << std::endl;
        for (const auto& header : res->headers) {
            std::cout << "  " << header.first << ": " << header.second << std::endl;
        }
        std::cout << "Body:" << std::endl;
        std::cout << res->body << std::endl;
    } else {
        auto err = res.error();
        std::cerr << "HTTP request failed: " << httplib::to_string(err) << std::endl;
    }

    return 0;
}