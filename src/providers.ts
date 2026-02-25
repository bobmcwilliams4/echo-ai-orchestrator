import type { Env, WorkerConfig, ChatMessage, LLMResponse } from './types';

const GH_MODELS_URL = 'https://models.github.ai/inference/chat/completions';

export function getWorkers(): WorkerConfig[] {
  return [
    // ── GITHUB MODELS (FREE) ──────────────────────────────────
    {
      id: 'gpt-4.1', name: 'GPT-4.1 (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/gpt-4.1', maxTokens: 8192, temperature: 0.3,
      strengths: ['coding', 'instruction following', 'reliable', 'top tier'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'gpt-4.1-mini', name: 'GPT-4.1-mini (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/gpt-4.1-mini', maxTokens: 8192, temperature: 0.3,
      strengths: ['fast', 'coding', 'cost-effective'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'gpt-4.1-nano', name: 'GPT-4.1-nano (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/gpt-4.1-nano', maxTokens: 4096, temperature: 0.3,
      strengths: ['fastest', 'lightweight tasks', 'bulk processing'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'deepseek-v3', name: 'DeepSeek-V3-0324 (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'deepseek/DeepSeek-V3-0324', maxTokens: 8192, temperature: 0.3,
      strengths: ['coding', 'python', 'function calling', 'free'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'deepseek-r1', name: 'DeepSeek-R1-0528 (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'deepseek/DeepSeek-R1-0528', maxTokens: 8192, temperature: 0.6,
      strengths: ['deep reasoning', 'chain-of-thought', 'math', 'logic'],
      status: 'ready', provider: 'github-models', reasoning: true,
    },
    {
      id: 'grok-3', name: 'Grok-3 (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'xai/grok-3', maxTokens: 8192, temperature: 0.3,
      strengths: ['complex reasoning', 'system-level', 'large scale'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'grok-3-mini', name: 'Grok-3-mini (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'xai/grok-3-mini', maxTokens: 4096, temperature: 0.3,
      strengths: ['fast reasoning', 'math', 'science'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'llama-4-scout', name: 'Llama-4-Scout (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'meta/Llama-4-Scout-17B-16E-Instruct', maxTokens: 4096, temperature: 0.3,
      strengths: ['summarization', 'code analysis', 'multilingual'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'llama-405b', name: 'Llama-3.1-405B (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'meta/Meta-Llama-3.1-405B-Instruct', maxTokens: 4096, temperature: 0.3,
      strengths: ['large model', 'versatile', 'enterprise QA'],
      status: 'ready', provider: 'github-models',
    },
    {
      id: 'gpt-4o', name: 'GPT-4o (GitHub Models FREE)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/gpt-4o', maxTokens: 8192, temperature: 0.3,
      strengths: ['multimodal', 'vision', 'legacy compatibility'],
      status: 'ready', provider: 'github-models',
    },

    // ── GATED MODELS ──────────────────────────────────────────
    {
      id: 'gpt-5', name: 'GPT-5 (needs access registration)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/gpt-5', maxTokens: 16384, temperature: 0.3,
      strengths: ['frontier reasoning', 'multi-step', 'complex tasks'],
      status: 'gated', provider: 'github-models',
    },
    {
      id: 'o3', name: 'o3 Reasoning (needs models:read scope)',
      apiUrl: GH_MODELS_URL, apiKeyEnv: 'GITHUB_TOKEN',
      model: 'openai/o3', maxTokens: 8192, temperature: 1.0,
      strengths: ['deep reasoning', 'math', 'logic', 'hard problems'],
      status: 'gated', provider: 'github-models', reasoning: true,
    },

    // ── DEEPSEEK DIRECT API ───────────────────────────────────
    {
      id: 'deepseek-direct', name: 'DeepSeek V3.2 (Direct API)',
      apiUrl: 'https://api.deepseek.com/chat/completions',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      model: 'deepseek-chat', maxTokens: 8192, temperature: 0.3,
      strengths: ['coding', 'python', 'fast', 'free tier direct'],
      status: 'ready', provider: 'deepseek-direct',
    },

    // ── OPENROUTER ────────────────────────────────────────────
    {
      id: 'openrouter', name: 'OpenRouter Llama 3.3 70B',
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      model: 'meta-llama/llama-3.3-70b-instruct:free', maxTokens: 4096, temperature: 0.3,
      strengths: ['free', 'bulk tasks', 'parallel execution'],
      status: 'ready', provider: 'openrouter',
    },

    // ── AZURE OPENAI — EchoOMEGA (eastus) ─────────────────────
    {
      id: 'azure-gpt4o', name: 'GPT-4o (Azure EchoOMEGA)',
      apiUrl: 'https://echoomegaopenai.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_ECHOOMEGA_KEY',
      model: 'gpt-4o', maxTokens: 8192, temperature: 0.3,
      strengths: ['multimodal', 'vision', 'reliable', 'azure-hosted'],
      status: 'ready', provider: 'azure-echoomega', authType: 'api-key',
    },
    {
      id: 'azure-gpt41', name: 'GPT-4.1 (Azure EchoOMEGA)',
      apiUrl: 'https://echoomegaopenai.openai.azure.com/openai/deployments/gpt41-eastus/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_ECHOOMEGA_KEY',
      model: 'gpt-4.1', maxTokens: 16384, temperature: 0.3,
      strengths: ['coding', 'instruction following', 'top tier', 'azure-hosted'],
      status: 'ready', provider: 'azure-echoomega', authType: 'api-key',
    },
    {
      id: 'azure-gpt41-mini', name: 'GPT-4.1-mini (Azure EchoOMEGA)',
      apiUrl: 'https://echoomegaopenai.openai.azure.com/openai/deployments/gpt41mini-eastus/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_ECHOOMEGA_KEY',
      model: 'gpt-4.1-mini', maxTokens: 8192, temperature: 0.3,
      strengths: ['fast', 'coding', 'cost-effective', 'azure-hosted'],
      status: 'ready', provider: 'azure-echoomega', authType: 'api-key',
    },
    {
      id: 'azure-o3-mini', name: 'o3-mini Reasoning (Azure EchoOMEGA)',
      apiUrl: 'https://echoomegaopenai.openai.azure.com/openai/deployments/o3mini-eastus/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_ECHOOMEGA_KEY',
      model: 'o3-mini', maxTokens: 8192, temperature: 1.0,
      strengths: ['deep reasoning', 'math', 'logic', 'chain-of-thought'],
      status: 'ready', provider: 'azure-echoomega', authType: 'api-key', reasoning: true,
    },

    // ── AZURE — echo-prime-resource (eastus2) ─────────────────
    {
      id: 'azure-prime-gpt41', name: 'GPT-4.1 (Azure Prime eastus2)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/openai/deployments/gpt-41-deploy/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'gpt-4.1', maxTokens: 16384, temperature: 0.3,
      strengths: ['coding', 'backup', 'azure-eastus2'],
      status: 'ready', provider: 'azure-prime', authType: 'api-key',
    },
    {
      id: 'azure-prime-o3-mini', name: 'o3-mini (Azure Prime eastus2)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/openai/deployments/o3-mini-deploy/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'o3-mini', maxTokens: 8192, temperature: 1.0,
      strengths: ['reasoning', 'backup', 'azure-eastus2'],
      status: 'ready', provider: 'azure-prime', authType: 'api-key', reasoning: true,
    },
    {
      id: 'azure-prime-gpt4o-mini', name: 'GPT-4o-mini (Azure Prime eastus2)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/openai/deployments/gpt-4o-mini-deploy/chat/completions?api-version=2025-01-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'gpt-4o-mini', maxTokens: 8192, temperature: 0.3,
      strengths: ['fast', 'cheap', 'bulk tasks', 'azure-eastus2'],
      status: 'ready', provider: 'azure-prime', authType: 'api-key',
    },

    // ── AZURE AI FOUNDRY — Serverless (FREE) ──────────────────
    {
      id: 'azure-deepseek-v3', name: 'DeepSeek-V3-0324 (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'DeepSeek-V3-0324', maxTokens: 8192, temperature: 0.3,
      strengths: ['coding', 'python', 'fast', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-deepseek-r1', name: 'DeepSeek-R1 (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'DeepSeek-R1', maxTokens: 8192, temperature: 0.6,
      strengths: ['deep reasoning', 'math', 'logic', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true, reasoning: true,
    },
    {
      id: 'azure-grok3', name: 'Grok-3 (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'grok-3', maxTokens: 8192, temperature: 0.3,
      strengths: ['reasoning', 'complex tasks', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-grok3-mini', name: 'Grok-3-mini (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'grok-3-mini', maxTokens: 4096, temperature: 0.3,
      strengths: ['fast reasoning', 'math', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-llama33-70b', name: 'Llama-3.3-70B (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'Llama-3.3-70B-Instruct', maxTokens: 4096, temperature: 0.3,
      strengths: ['versatile', 'multilingual', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-llama4-scout', name: 'Llama-4-Scout (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'Llama-4-Scout-17B-16E-Instruct', maxTokens: 4096, temperature: 0.3,
      strengths: ['summarization', 'analysis', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-mai-ds-r1', name: 'MAI-DS-R1 (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'MAI-DS-R1', maxTokens: 8192, temperature: 0.3,
      strengths: ['reasoning', 'microsoft tuned', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
    {
      id: 'azure-qwen3-32b', name: 'Qwen-3-32B (Azure Serverless FREE)',
      apiUrl: 'https://echo-prime-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      apiKeyEnv: 'AZURE_PRIME_KEY',
      model: 'qwen-3-32b', maxTokens: 4096, temperature: 0.3,
      strengths: ['coding', 'multilingual', 'free serverless'],
      status: 'ready', provider: 'azure-serverless', authType: 'api-key', serverless: true,
    },
  ];
}

export function getWorkerById(workers: WorkerConfig[], id: string): WorkerConfig | undefined {
  return workers.find(w => w.id === id);
}

export function getReadyWorkers(workers: WorkerConfig[], env: Env): WorkerConfig[] {
  return workers.filter(w => w.status === 'ready' && !!env[w.apiKeyEnv]);
}

export async function callWorker(
  worker: WorkerConfig,
  messages: ChatMessage[],
  env: Env,
  options: { maxTokens?: number; temperature?: number; model?: string } = {}
): Promise<LLMResponse> {
  const apiKey = env[worker.apiKeyEnv] as string;
  if (!apiKey) throw new Error(`No API key for ${worker.id} (env: ${worker.apiKeyEnv})`);

  const startTime = Date.now();
  const isReasoning = worker.reasoning ?? false;
  const isGitHub = worker.apiUrl.includes('models.github.ai');
  const isAzureKey = worker.authType === 'api-key';
  const needsModel = worker.serverless || isGitHub;

  const body: Record<string, unknown> = {
    messages,
    ...(isReasoning ? {} : { temperature: options.temperature ?? worker.temperature }),
  };

  if (needsModel) body.model = options.model || worker.model;

  if (isReasoning) {
    body.max_completion_tokens = options.maxTokens || worker.maxTokens;
  } else {
    body.max_tokens = options.maxTokens || worker.maxTokens;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(isAzureKey ? { 'api-key': apiKey } : { 'Authorization': `Bearer ${apiKey}` }),
    ...(isGitHub ? { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } : {}),
    ...(worker.id === 'openrouter' ? { 'HTTP-Referer': 'https://echo-op.com' } : {}),
  };

  const response = await fetch(worker.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${worker.name} API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  return {
    worker: worker.id,
    workerName: worker.name,
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {},
    elapsed_ms: Date.now() - startTime,
    model: (needsModel ? (options.model || worker.model) : worker.model),
  };
}
