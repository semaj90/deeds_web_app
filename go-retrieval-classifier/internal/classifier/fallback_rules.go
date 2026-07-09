package classifier

import "fmt"

// FallbackRules provide safety checks when XGBoost confidence is low
type FallbackRules struct {
	MinConfidence float32
	DefaultLane   string
	RulesEnabled  bool
}

// FallbackDecision represents why a lane was chosen
type FallbackDecision struct {
	Lane          string
	Confidence    float32
	Reason        string
	UsedFallback  bool
}

// NewFallbackRules creates safety rules
func NewFallbackRules() *FallbackRules {
	return &FallbackRules{
		MinConfidence: 0.70,  // Require >70% confidence to trust classifier
		DefaultLane:   "bm25-fallback",  // Fallback for low confidence
		RulesEnabled:  true,
	}
}

// ApplyFallback checks if classifier prediction should be overridden
func (fr *FallbackRules) ApplyFallback(
	classifierLane string,
	confidence float32,
	features map[string]float32,
) *FallbackDecision {
	if !fr.RulesEnabled {
		return &FallbackDecision{
			Lane:       classifierLane,
			Confidence: confidence,
			Reason:     "classifier (rules disabled)",
			UsedFallback: false,
		}
	}

	// Rule 1: Low confidence → fallback to bm25
	if confidence < fr.MinConfidence {
		return &FallbackDecision{
			Lane:       fr.DefaultLane,
			Confidence: confidence,
			Reason:     fmt.Sprintf("confidence %.2f < threshold %.2f", confidence, fr.MinConfidence),
			UsedFallback: true,
		}
	}

	// Rule 2: Rare class validation
	if classifierLane == "som-topology" {
		// SOM only works if we have som_row and som_col
		somRow := features["som_row"]
		somCol := features["som_col"]

		if somRow == 0 || somCol == 0 {
			return &FallbackDecision{
				Lane:       fr.DefaultLane,
				Confidence: confidence,
				Reason:     "som-topology selected but som_row/col missing",
				UsedFallback: true,
			}
		}

		// SOM topology has low recall (0.65); downgrade if confidence borderline
		if confidence < 0.85 {
			return &FallbackDecision{
				Lane:       fr.DefaultLane,
				Confidence: confidence,
				Reason:     fmt.Sprintf("som-topology unreliable at confidence %.2f", confidence),
				UsedFallback: true,
			}
		}
	}

	// Rule 3: neo4j-authority validation
	if classifierLane == "neo4j-authority" {
		// neo4j-authority only works if we have pagerank
		pagerank := features["pagerank"]

		if pagerank == 0 {
			return &FallbackDecision{
				Lane:       fr.DefaultLane,
				Confidence: confidence,
				Reason:     "neo4j-authority selected but pagerank missing",
				UsedFallback: true,
			}
		}

		// neo4j-authority is rare (0.01% of data); require high confidence
		if confidence < 0.95 {
			return &FallbackDecision{
				Lane:       fr.DefaultLane,
				Confidence: confidence,
				Reason:     fmt.Sprintf("neo4j-authority ultra-rare, requires confidence > 0.95 (got %.2f)", confidence),
				UsedFallback: true,
			}
		}
	}

	// Rule 4: qdrant-dense requires embeddings
	if classifierLane == "qdrant-dense" {
		hasContentVec := features["has_content_vec"]
		hasSummaryVec := features["has_summary_vec"]
		hasKeywordVec := features["has_keyword_vec"]

		if hasContentVec == 0 && hasSummaryVec == 0 && hasKeywordVec == 0 {
			return &FallbackDecision{
				Lane:       fr.DefaultLane,
				Confidence: confidence,
				Reason:     "qdrant-dense selected but no embeddings available",
				UsedFallback: true,
			}
		}
	}

	// All validations passed; use classifier recommendation
	return &FallbackDecision{
		Lane:       classifierLane,
		Confidence: confidence,
		Reason:     "classifier (passed all validation rules)",
		UsedFallback: false,
	}
}

// DensityFallback selects lane based on feature density when confidence is very low
func (fr *FallbackRules) DensityFallback(features map[string]float32) string {
	// Count available features
	density := 0
	if features["pagerank"] > 0 {
		density++
	}
	if features["som_row"] > 0 && features["som_col"] > 0 {
		density++
	}
	if features["community_id"] > 0 {
		density++
	}
	if features["has_content_vec"] > 0 || features["has_summary_vec"] > 0 || features["has_keyword_vec"] > 0 {
		density++
	}

	// Route based on available signals
	switch {
	case features["has_content_vec"] > 0:
		return "qdrant-dense"  // Embeddings available
	case features["pagerank"] > 0:
		return "neo4j-authority"  // Graph signal available
	case features["som_row"] > 0 && features["som_col"] > 0:
		return "som-topology"  // SOM signal available
	default:
		return "bm25-fallback"  // Fallback for sparse features
	}
}

// ValidateLaneRequirements checks if a lane can actually be executed
func (fr *FallbackRules) ValidateLaneRequirements(lane string, features map[string]float32) bool {
	switch lane {
	case "qdrant-dense":
		return features["has_content_vec"] > 0 ||
			features["has_summary_vec"] > 0 ||
			features["has_keyword_vec"] > 0

	case "neo4j-authority":
		return features["pagerank"] > 0

	case "som-topology":
		return features["som_row"] > 0 && features["som_col"] > 0

	case "bm25-fallback":
		return true  // Always available

	default:
		return false
	}
}
