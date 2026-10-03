<#
.SYNOPSIS
    Legal AI Endpoints Helper

.DESCRIPTION
    Provides functions for AI-powered legal concept extraction and domain classification.
    These functions interface with your AI service endpoints.

.NOTES
    Author: Legal AI Audit System
    Version: 1.0.0
#>

[CmdletBinding()]
param()

# ============================================================
# LEGAL CONCEPT EXTRACTION
# ============================================================

function Invoke-LegalConceptExtraction {
    <#
    .SYNOPSIS
        Extracts key legal concepts, terms, and entities from document text.
    .DESCRIPTION
        Sends document text to the AI extraction endpoint and returns structured results.
    .PARAMETER DocumentText
        The text content of the document to analyze.
    .PARAMETER DocumentName
        The name of the document (for logging and error messages).
    .PARAMETER ApiKey
        API key for authentication.
    .EXAMPLE
        $result = Invoke-LegalConceptExtraction -DocumentText $text -DocumentName "Contract.pdf"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DocumentText,
        
        [Parameter(Mandatory = $false)]
        [string]$DocumentName = "Unknown",
        
        [Parameter(Mandatory = $false)]
        [string]$ApiKey = $env:LEGAL_AI_API_KEY
    )
    
    # Endpoint configuration
    $extractionUrl = $env:LEGAL_AI_EXTRACTION_URL
    if (-not $extractionUrl) {
        throw "LEGAL_AI_EXTRACTION_URL environment variable not set"
    }
    
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        document = $DocumentText
        extract = @{
            concepts = $true
            keyTerms = $true
            entities = $true
            relationships = $true
        }
    }
    
    return Invoke-AiEndpoint -Uri $extractionUrl -Method Post -Body ($body | ConvertTo-Json) -Headers $headers -TimeoutSec 300 -DocumentName $DocumentName
}

# ============================================================
# LEGAL DOMAIN CLASSIFICATION
# ============================================================

function Invoke-LegalDomainClassification {
    <#
    .SYNOPSIS
        Classifies a document by legal domain.
    .DESCRIPTION
        Sends document text to the AI classification endpoint and returns domain classification.
    .PARAMETER DocumentText
        The text content of the document to classify.
    .PARAMETER DocumentName
        The name of the document (for logging and error messages).
    .PARAMETER ApiKey
        API key for authentication.
    .EXAMPLE
        $result = Invoke-LegalDomainClassification -DocumentText $text -DocumentName "Contract.pdf"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DocumentText,
        
        [Parameter(Mandatory = $false)]
        [string]$DocumentName = "Unknown",
        
        [Parameter(Mandatory = $false)]
        [string]$ApiKey = $env:LEGAL_AI_API_KEY
    )
    
    # Endpoint configuration
    $classificationUrl = $env:LEGAL_AI_CLASSIFICATION_URL
    if (-not $classificationUrl) {
        throw "LEGAL_AI_CLASSIFICATION_URL environment variable not set"
    }
    
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        document = $DocumentText
        classify = $true
    }
    
    return Invoke-AiEndpoint -Uri $classificationUrl -Method Post -Body ($body | ConvertTo-Json) -Headers $headers -TimeoutSec 300 -DocumentName $DocumentName
}

# ============================================================
# HELPER: AI ENDPOINT INVOCATION
# ============================================================

function Invoke-AiEndpoint {
    <#
    .SYNOPSIS
        Generic AI endpoint invocation with error handling.
    .DESCRIPTION
        Sends a POST request to an AI endpoint and returns the response, or a default error result.
    .PARAMETER Uri
        The endpoint URL to call.
    .PARAMETER Method
        The HTTP method to use (default: Post).
    .PARAMETER Body
        The request body (JSON string).
    .PARAMETER Headers
        Additional headers to include.
    .PARAMETER TimeoutSec
        Timeout in seconds.
    .PARAMETER DocumentName
        Document name for logging.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("Get", "Post", "Put", "Delete")]
        [string]$Method = "Post",
        
        [Parameter(Mandatory = $false)]
        [string]$Body,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Headers = @(),
        
        [Parameter(Mandatory = $false)]
        [int]$TimeoutSec = 300,
        
        [Parameter(Mandatory = $false)]
        [string]$DocumentName = "Unknown"
    )
    
    try {
        $response = Invoke-RestMethod -Uri $Uri -Method $Method -Body $Body -Headers $Headers -TimeoutSec $TimeoutSec
        return $response
    }
    catch {
        Write-Warning ("AI endpoint call failed for $DocumentName: $($_.Exception.Message)")
        return $null
    }
}

# Export functions for module use
Export-ModuleMember -Function @(
    "Invoke-LegalConceptExtraction",
    "Invoke-LegalDomainClassification"
)
