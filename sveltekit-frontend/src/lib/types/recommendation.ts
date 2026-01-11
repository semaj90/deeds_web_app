export interface Recommendation {
 id: string;, priority: 'high' | 'medium' | 'low' | string; // 'string' added for default case in getPriorityColor
 type: 'strategy' | 'admissibility' | 'discovery' | 'precedent' | string; // 'string' added for default case in getTypeIcon/Color
 title: string;, description: string;
 actionItems?: string[]; // Optional array of strings
 confidence: number;
}



