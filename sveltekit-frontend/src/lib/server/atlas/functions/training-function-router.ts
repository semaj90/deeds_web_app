export type PostTrainingMethod = 'NONE' | 'SFT' | 'PEFT' | 'DPO' | 'PPO' | 'REWARD_MODELING';
export type ClassifierFamily = 'PYTORCH' | 'XGBOOST' | 'LOGISTIC_REGRESSION' | 'SVM' | 'ORDINAL_REGRESSION';
export type TrainingExecutor = 'cpu' | 'cuda';

export interface TrainingFunctionRequest {
  task: 'CLASSIFICATION' | 'MULTILABEL' | 'ORDINAL' | 'PAIRWISE_PREFERENCE' | 'POLICY_OPTIMIZATION' | 'REWARD_MODEL';
  method?: PostTrainingMethod;
  classifierFamily?: ClassifierFamily;
  classCount?: number;
  orderedClasses?: boolean;
  independentLabels?: boolean;
  preferTreeModel?: boolean;
  cudaAvailable?: boolean;
  peftAvailable?: boolean;
  trlAvailable?: boolean;
  existingModelRevision?: string | null;
}

export interface TrainingFunctionPlan {
  trainingMethod: PostTrainingMethod;
  classifierFamily: ClassifierFamily | null;
  executor: TrainingExecutor;
  outputDecision: 'SOFTMAX' | 'SIGMOID' | 'ARGMAX' | 'THRESHOLD' | 'ORDERED_SCORE' | 'PAIRWISE_LOGPROB' | 'POLICY_LOGPROB';
  requiresReferenceModel: boolean;
  notes: string[];
}

export function planTrainingFunction(req: TrainingFunctionRequest): TrainingFunctionPlan {
  let method = req.method ?? 'NONE';
  let family: ClassifierFamily | null = req.classifierFamily ?? null;

  if (req.task === 'PAIRWISE_PREFERENCE') method = method === 'NONE' ? 'DPO' : method;
  if (req.task === 'POLICY_OPTIMIZATION') method = method === 'NONE' ? 'PPO' : method;
  if (req.task === 'REWARD_MODEL') method = method === 'NONE' ? 'REWARD_MODELING' : method;

  if (method === 'PEFT' && !req.peftAvailable) throw new Error('PEFT requested but PEFT runtime is unavailable');
  if ((method === 'DPO' || method === 'PPO' || method === 'REWARD_MODELING') && !req.trlAvailable) {
    throw new Error(`${method} requested but TRL runtime is unavailable`);
  }

  if (!family && (req.task === 'CLASSIFICATION' || req.task === 'MULTILABEL' || req.task === 'ORDINAL')) {
    family = req.orderedClasses || req.task === 'ORDINAL'
      ? 'ORDINAL_REGRESSION'
      : req.preferTreeModel
        ? 'XGBOOST'
        : 'LOGISTIC_REGRESSION';
  }

  const executor: TrainingExecutor = req.cudaAvailable && (family === 'PYTORCH' || family === 'XGBOOST' || method !== 'NONE') ? 'cuda' : 'cpu';
  const outputDecision: TrainingFunctionPlan['outputDecision'] =
    req.task === 'MULTILABEL' || req.independentLabels ? 'SIGMOID'
    : req.task === 'ORDINAL' || req.orderedClasses ? 'ORDERED_SCORE'
    : req.task === 'PAIRWISE_PREFERENCE' ? 'PAIRWISE_LOGPROB'
    : req.task === 'POLICY_OPTIMIZATION' ? 'POLICY_LOGPROB'
    : req.task === 'REWARD_MODEL' ? 'ARGMAX'
    : 'SOFTMAX';

  return {
    trainingMethod: method,
    classifierFamily: family,
    executor,
    outputDecision,
    requiresReferenceModel: method === 'DPO',
    notes: [
      'Training method and inference decision function are separate axes.',
      'XGBoost CPU/CUDA are executor choices for one trained model family.',
      'Logistic regression is a strong bounded CPU baseline for low-dimensional domain/intent classification.',
      method === 'PPO' ? 'PPO updates a policy from rewards; keep runtime action selection separately receipted.' : '',
    ].filter(Boolean),
  };
}
