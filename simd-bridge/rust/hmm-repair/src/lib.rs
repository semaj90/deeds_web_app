use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use regex::Regex;

#[napi(string_enum)]
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
pub enum HmmState {
    Parties,
    Jurisdiction,
    Facts,
    LegalAuthority,
    Claims,
    Prayer,
    Holding,
}

impl HmmState {
    fn as_str(&self) -> &'static str {
        match self {
            HmmState::Parties => "PARTIES",
            HmmState::Jurisdiction => "JURISDICTION",
            HmmState::Facts => "FACTS",
            HmmState::LegalAuthority => "LEGAL_AUTHORITY",
            HmmState::Claims => "CLAIMS",
            HmmState::Prayer => "PRAYER",
            HmmState::Holding => "HOLDING",
        }
    }
}

const STATES: [HmmState; 7] = [
    HmmState::Parties,
    HmmState::Jurisdiction,
    HmmState::Facts,
    HmmState::LegalAuthority,
    HmmState::Claims,
    HmmState::Prayer,
    HmmState::Holding,
];

#[napi(object)]
#[derive(Serialize, Deserialize)]
pub struct HmmPrediction {
    pub primary_state: String,
    pub confidence: f64,
    pub state_probabilities: HashMap<String, f64>,
    pub state_sequence: Vec<String>,
}

struct Model {
    transitions: HashMap<HmmState, HashMap<HmmState, f64>>,
    emissions: HashMap<HmmState, HashMap<String, f64>>,
}

lazy_static::lazy_static! {
    static ref RE_TOKEN: Regex = Regex::new(r"\b\w+\b").unwrap();
    static ref HMM_MODEL: Model = Model::new();
}

impl Model {
    fn new() -> Self {
        let mut transitions = HashMap::new();
        let mut emissions = HashMap::new();

        // Full Transitions (mirroring TypeScript TRANSITIONS exactly)
        let trans_data = [
            (HmmState::Parties, vec![(HmmState::Jurisdiction, 0.9), (HmmState::Facts, 0.1)]),
            (HmmState::Jurisdiction, vec![(HmmState::Facts, 0.8), (HmmState::LegalAuthority, 0.2)]),
            (HmmState::Facts, vec![(HmmState::LegalAuthority, 0.7), (HmmState::Claims, 0.3)]),
            (HmmState::LegalAuthority, vec![(HmmState::Claims, 0.8), (HmmState::Facts, 0.2)]),
            (HmmState::Claims, vec![(HmmState::Prayer, 0.6), (HmmState::Holding, 0.4)]),
            (HmmState::Prayer, vec![(HmmState::Holding, 0.9), (HmmState::Parties, 0.1)]),
            (HmmState::Holding, vec![(HmmState::Parties, 0.1), (HmmState::Holding, 0.9)]),
        ];

        for (from, to_probs) in trans_data {
            let mut t = HashMap::new();
            for (to, prob) in to_probs {
                t.insert(to, prob);
            }
            transitions.insert(from, t);
        }

        // Full Emissions (mirroring TypeScript EMISSIONS exactly)
        let emissions_data = [
            (HmmState::Parties, vec![
                ("plaintiff", 0.15), ("defendant", 0.15), ("appellant", 0.1),
                ("respondent", 0.1), ("petitioner", 0.1), ("v", 0.2),
                ("versus", 0.15), ("party", 0.05),
            ]),
            (HmmState::Jurisdiction, vec![
                ("jurisdiction", 0.2), ("venue", 0.15), ("court", 0.15),
                ("district", 0.1), ("federal", 0.1), ("state", 0.1),
                ("competent", 0.05), ("proper", 0.05),
            ]),
            (HmmState::Facts, vec![
                ("occurred", 0.1), ("happened", 0.1), ("alleged", 0.15),
                ("facts", 0.1), ("incident", 0.1), ("event", 0.1),
                ("date", 0.1), ("time", 0.05), ("place", 0.05),
            ]),
            (HmmState::LegalAuthority, vec![
                ("statute", 0.15), ("regulation", 0.15), ("constitution", 0.1),
                ("law", 0.15), ("code", 0.1), ("section", 0.1),
                ("usc", 0.1), ("precedent", 0.05),
            ]),
            (HmmState::Claims, vec![
                ("claim", 0.2), ("cause", 0.15), ("action", 0.15),
                ("violation", 0.15), ("breach", 0.1), ("negligence", 0.1),
                ("damages", 0.05),
            ]),
            (HmmState::Prayer, vec![
                ("prayer", 0.2), ("relief", 0.2), ("damages", 0.15),
                ("injunction", 0.15), ("declaratory", 0.1), ("request", 0.05),
            ]),
            (HmmState::Holding, vec![
                ("held", 0.2), ("holding", 0.2), ("ruled", 0.15),
                ("affirmed", 0.1), ("reversed", 0.1), ("remanded", 0.1),
                ("therefore", 0.05),
            ]),
        ];

        for (state, words) in emissions_data {
            let mut e = HashMap::new();
            let alpha = 0.001;
            let v = 5000.0; // Estimated legal vocabulary size
            let total_prob: f64 = words.iter().map(|(_, p)| p).sum();
            
            // Re-normalize with Laplace smoothing
            for (word, prob) in words {
                let smoothed = (prob + alpha) / (total_prob + alpha * v);
                e.insert(word.to_string(), smoothed);
            }
            emissions.insert(state, e);
        }

        Self { transitions, emissions }
    }

    fn log_emit(&self, state: HmmState, word: &str) -> f64 {
        let alpha = 0.001;
        let v = 5000.0;
        let total_prob = 1.0; // Base normalized sum

        let prob = self.emissions.get(&state)
            .and_then(|e| e.get(word))
            .cloned()
            .unwrap_or(alpha / (total_prob + alpha * v));
            
        (prob + 1e-12).ln()
    }

    fn log_trans(&self, from: HmmState, to: HmmState) -> f64 {
        let prob = self.transitions.get(&from)
            .and_then(|t| t.get(&to))
            .cloned()
            .unwrap_or(1.0 / 7.0);
        (prob + 1e-12).ln()
    }
}

#[napi]
pub fn predict_chunk_rust(text: String) -> HmmPrediction {
    let tokens: Vec<String> = RE_TOKEN.find_iter(&text.to_lowercase())
        .map(|m| m.as_str().to_string())
        .collect();

    if tokens.is_empty() {
        let mut probs = HashMap::new();
        for s in STATES {
            probs.insert(s.as_str().to_string(), 0.0);
        }
        probs.insert("FACTS".to_string(), 1.0);
        return HmmPrediction {
            primary_state: "FACTS".to_string(),
            confidence: 0.0,
            state_probabilities: probs,
            state_sequence: vec![],
        };
    }

    let model = &HMM_MODEL;
    let n = STATES.len();
    let t_len = tokens.len();
    let log_min = -1e10;

    let mut v = vec![vec![log_min; t_len]; n];
    let mut bp = vec![vec![0; t_len]; n];

    // Initial
    for i in 0..n {
        v[i][0] = model.log_emit(STATES[i], &tokens[0]);
    }

    // Forward
    for t in 1..t_len {
        for j in 0..n {
            let emit_log_p = model.log_emit(STATES[j], &tokens[t]);
            let mut best = log_min;
            let mut best_idx = 0;
            for i in 0..n {
                let p = v[i][t - 1] + model.log_trans(STATES[i], STATES[j]);
                if p > best {
                    best = p;
                    best_idx = i;
                }
            }
            v[j][t] = best + emit_log_p;
            bp[j][t] = best_idx;
        }
    }

    // Backtrack
    let mut last = 0;
    let mut best_final = log_min;
    for i in 0..n {
        if v[i][t_len - 1] > best_final {
            best_final = v[i][t_len - 1];
            last = i;
        }
    }

    let mut path_indices = vec![0; t_len];
    path_indices[t_len - 1] = last;
    for t in (1..t_len).rev() {
        last = bp[last][t];
        path_indices[t - 1] = last;
    }

    let path: Vec<String> = path_indices.iter().map(|&i| STATES[i].as_str().to_string()).collect();

    // Stats
    let mut counts = HashMap::new();
    for s in &path {
        *counts.entry(s.clone()).or_insert(0) += 1;
    }

    let mut state_probabilities = HashMap::new();
    for s in STATES {
        let count = counts.get(s.as_str()).cloned().unwrap_or(0);
        state_probabilities.insert(s.as_str().to_string(), count as f64 / t_len as f64);
    }

    let primary_state = counts.into_iter()
        .max_by_key(|&(_, count)| count)
        .map(|(s, _)| s)
        .unwrap_or_else(|| "FACTS".to_string());

    let confidence = (best_final / t_len as f64).exp().min(1.0);

    HmmPrediction {
        primary_state,
        confidence,
        state_probabilities,
        state_sequence: path,
    }
}
