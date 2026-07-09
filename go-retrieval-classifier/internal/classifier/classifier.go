package classifier

import (
	"encoding/json"
	"fmt"
	"os"
)

// Classifier wraps the XGBoost model
type Classifier struct {
	NumFeats    int
	NumCls      int
	Cls         []string
	Trees       []*Tree
	NumClasses  int
	FeatureNames []string
}

// Tree represents a single decision tree in the ensemble
type Tree struct {
	NodeID   int
	Depth    int
	Split    *SplitNode
	Leaf     *LeafNode
}

// SplitNode represents a split decision
type SplitNode struct {
	Feature int
	Threshold float32
	LeftChild *Tree
	RightChild *Tree
	GainMetric float32
}

// LeafNode represents a terminal node with class predictions
type LeafNode struct {
	Scores []float32
	Leaf int
}

// LoadFromJSON loads an XGBoost model from JSON format
func LoadFromJSON(modelPath, metadataPath string) (*Classifier, error) {
	// Load metadata
	metaData, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read metadata: %w", err)
	}

	var meta struct {
		NumClasses   int      `json:"num_classes"`
		Classes      []string `json:"classes"`
		NumFeatures  int      `json:"num_features"`
		FeatureNames []string `json:"feature_names"`
	}

	if err := json.Unmarshal(metaData, &meta); err != nil {
		return nil, fmt.Errorf("failed to parse metadata: %w", err)
	}

	// Load model
	modelData, err := os.ReadFile(modelPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read model: %w", err)
	}

	var modelJSON []map[string]interface{}
	if err := json.Unmarshal(modelData, &modelJSON); err != nil {
		// Try parsing as single object
		var single map[string]interface{}
		if err := json.Unmarshal(modelData, &single); err != nil {
			return nil, fmt.Errorf("failed to parse model: %w", err)
		}
		modelJSON = []map[string]interface{}{single}
	}

	// Parse trees
	trees := make([]*Tree, len(modelJSON))
	for i, treeJSON := range modelJSON {
		tree, err := parseTree(treeJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to parse tree %d: %w", i, err)
		}
		trees[i] = tree
	}

	return &Classifier{
		NumFeats:     meta.NumFeatures,
		NumCls:       meta.NumClasses,
		Cls:          meta.Classes,
		Trees:        trees,
		NumClasses:   meta.NumClasses,
		FeatureNames: meta.FeatureNames,
	}, nil
}

// parseTree recursively parses a tree from JSON
func parseTree(treeJSON map[string]interface{}) (*Tree, error) {
	tree := &Tree{}

	// Check if leaf node
	if leaf, ok := treeJSON["leaf"].(float64); ok {
		scores := []float32{float32(leaf)}
		tree.Leaf = &LeafNode{
			Scores: scores,
			Leaf:   int(leaf),
		}
		return tree, nil
	}

	// Parse split node
	if split, ok := treeJSON["split"]; ok {
		feature, ok := split.(map[string]interface{})["split"].(float64)
		if !ok {
			return nil, fmt.Errorf("missing split feature")
		}

		threshold, ok := split.(map[string]interface{})["threshold"].(float64)
		if !ok {
			return nil, fmt.Errorf("missing split threshold")
		}

		leftJSON, ok := split.(map[string]interface{})["yes"].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("missing left child")
		}

		rightJSON, ok := split.(map[string]interface{})["no"].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("missing right child")
		}

		left, err := parseTree(leftJSON)
		if err != nil {
			return nil, err
		}

		right, err := parseTree(rightJSON)
		if err != nil {
			return nil, err
		}

		tree.Split = &SplitNode{
			Feature:    int(feature),
			Threshold:  float32(threshold),
			LeftChild:  left,
			RightChild: right,
		}
	}

	return tree, nil
}

// Predict predicts the class for features (returns class index and confidence)
func (c *Classifier) Predict(features []float32) (int, float32) {
	if len(features) != c.NumFeats {
		return 0, 0
	}

	// Accumulate scores across all trees
	scores := make([]float32, c.NumClasses)

	for _, tree := range c.Trees {
		leafScores := c.predictTree(tree, features)
		for i, s := range leafScores {
			if i < len(scores) {
				scores[i] += s
			}
		}
	}

	// Find max score and class
	maxIdx := 0
	maxScore := scores[0]
	for i := 1; i < len(scores); i++ {
		if scores[i] > maxScore {
			maxScore = scores[i]
			maxIdx = i
		}
	}

	// Softmax-like confidence (approximate)
	confidence := 1.0 / (1.0 + (1.0 / (1.0 + maxScore)))
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 1 {
		confidence = 1
	}

	return maxIdx, confidence
}

// predictTree predicts using a single tree
func (c *Classifier) predictTree(tree *Tree, features []float32) []float32 {
	if tree.Leaf != nil {
		scores := make([]float32, c.NumClasses)
		if len(tree.Leaf.Scores) == c.NumClasses {
			copy(scores, tree.Leaf.Scores)
		} else if len(tree.Leaf.Scores) > 0 {
			scores[0] = tree.Leaf.Scores[0]
		}
		return scores
	}

	if tree.Split == nil {
		return make([]float32, c.NumClasses)
	}

	if tree.Split.Feature < len(features) && features[tree.Split.Feature] <= tree.Split.Threshold {
		return c.predictTree(tree.Split.LeftChild, features)
	}
	return c.predictTree(tree.Split.RightChild, features)
}

// NumFeatures returns the number of input features
func (c *Classifier) NumFeatures() int {
	return c.NumFeats
}

// NumClasses returns the number of classes
func (c *Classifier) NumClasses() int {
	return c.NumCls
}

// Classes returns the class names
func (c *Classifier) Classes() []string {
	return c.Cls
}
