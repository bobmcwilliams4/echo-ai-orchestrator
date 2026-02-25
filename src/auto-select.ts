import type { Env, WorkerConfig, AutoSelectResult } from './types';
import { getReadyWorkers } from './providers';

interface ScoreContext {
  task: string;
  recentErrors?: Map<string, number>;
}

export function autoSelect(
  workers: WorkerConfig[],
  env: Env,
  ctx: ScoreContext
): AutoSelectResult[] {
  const task = ctx.task.toLowerCase();
  const ready = getReadyWorkers(workers, env);

  const scored = ready.map(w => {
    let score = 0;
    const strengths = w.strengths.map(s => s.toLowerCase());

    // Coding/build tasks
    if (task.includes('cod') || task.includes('build') || task.includes('program') || task.includes('engine') || task.includes('python') || task.includes('script')) {
      if (strengths.some(s => s.includes('coding'))) score += 10;
      if (w.model.includes('gpt-4.1') || w.model.toLowerCase().includes('deepseek')) score += 5;
      if (strengths.some(s => s.includes('top tier'))) score += 3;
    }

    // Reasoning/math/logic tasks
    if (task.includes('reason') || task.includes('math') || task.includes('logic') || task.includes('analyze')) {
      if (w.reasoning) score += 15;
      if (strengths.some(s => s.includes('reasoning') || s.includes('math'))) score += 10;
    }

    // Fast/bulk tasks
    if (task.includes('fast') || task.includes('bulk') || task.includes('quick') || task.includes('simple')) {
      if (strengths.some(s => s.includes('fast') || s.includes('fastest'))) score += 10;
      if (w.model.includes('mini') || w.model.includes('nano')) score += 5;
    }

    // Summarization
    if (task.includes('summar') || task.includes('review') || task.includes('extract')) {
      if (strengths.some(s => s.includes('summarization') || s.includes('analysis'))) score += 8;
    }

    // Multimodal/vision
    if (task.includes('image') || task.includes('vision') || task.includes('multimodal')) {
      if (strengths.some(s => s.includes('multimodal') || s.includes('vision'))) score += 15;
    }

    // Provider preference: Azure dedicated > GitHub shared > others
    if (w.provider.startsWith('azure-echoomega') || w.provider.startsWith('azure-prime')) score += 3;
    else if (w.provider === 'github-models') score += 2;
    else score += 1;

    // Penalize recent errors
    const errorKey = `${w.provider}:${w.id}`;
    const recentErrors = ctx.recentErrors?.get(errorKey) ?? 0;
    if (recentErrors > 10) score -= 5;
    if (recentErrors > 50) score -= 10;

    return {
      id: w.id,
      name: w.name,
      model: w.model,
      score,
      provider: w.provider,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function selectBestWorker(
  workers: WorkerConfig[],
  env: Env,
  task: string
): AutoSelectResult | null {
  const results = autoSelect(workers, env, { task });
  return results.length > 0 ? results[0] : null;
}
