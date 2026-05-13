use napi_derive::napi;
use petgraph::prelude::*;
use rand::prelude::*;
use std::collections::HashMap;

#[napi]
pub struct CommunityResult {
    pub community_id: i32,
    pub node_ids: Vec<String>,
    pub size: i32,
}

#[napi]
pub fn detect_communities_rust(
    node_ids: Vec<String>,
    edges_from: Vec<String>,
    edges_to: Vec<String>,
    max_iter: i32,
) -> Vec<CommunityResult> {
    let n = node_ids.len();
    if n == 0 {
        return vec![];
    }

    let mut graph = UnGraph::<usize, ()>::with_capacity(n, edges_from.len());
    let mut node_map = HashMap::with_capacity(n);

    // Add nodes
    for (i, id) in node_ids.iter().enumerate() {
        let idx = graph.add_node(i);
        node_map.insert(id.clone(), idx);
    }

    // Add edges
    for i in 0..edges_from.len() {
        if let (Some(&u), Some(&v)) = (node_map.get(&edges_from[i]), node_map.get(&edges_to[i])) {
            graph.add_edge(u, v, ());
        }
    }

    // Label propagation
    let mut labels: Vec<usize> = (0..n).collect();
    let mut rng = thread_rng();
    let mut order: Vec<usize> = (0..n).collect();

    for _ in 0..max_iter {
        let mut changed = false;
        order.shuffle(&mut rng);

        for &i in order.iter() {
            let node_idx = NodeIndex::new(i);
            let neighbors: Vec<_> = graph.neighbors(node_idx).collect();
            if neighbors.is_empty() {
                continue;
            }

            let mut label_counts = HashMap::new();
            for neighbor in neighbors {
                let neighbor_label = labels[neighbor.index()];
                *label_counts.entry(neighbor_label).or_insert(0) += 1;
            }

            let mut best_label = labels[i];
            let mut best_count = 0;

            for (&label, &count) in label_counts.iter() {
                if count > best_count {
                    best_label = label;
                    best_count = count;
                }
            }

            if best_label != labels[i] {
                labels[i] = best_label;
                changed = true;
            }
        }

        if !changed {
            break;
        }
    }

    // Group into communities
    let mut community_map: HashMap<usize, Vec<String>> = HashMap::new();
    for i in 0..n {
        let label = labels[i];
        community_map.entry(label).or_default().push(node_ids[i].clone());
    }

    let mut results: Vec<CommunityResult> = community_map
        .into_iter()
        .map(|(label, members)| CommunityResult {
            community_id: label as i32,
            size: members.len() as i32,
            node_ids: members,
        })
        .collect();

    results.sort_by(|a, b| b.size.cmp(&a.size));
    
    // Re-index community IDs to be sequential
    for (i, res) in results.iter_mut().enumerate() {
        res.community_id = i as i32;
    }

    results
}
