export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  R2: R2Bucket;
  BUILD_QUEUE: Queue;
  GITHUB_TOKEN: string;
  AZURE_ECHOOMEGA_KEY: string;
  AZURE_PRIME_KEY: string;
  DEEPSEEK_API_KEY: string;
  OPENROUTER_API_KEY: string;
  ECHO_API_KEY: string;
  XAI_API_KEY: string;
  ENVIRONMENT: string;
}

export interface WorkerConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKeyEnv: keyof Env;
  model: string;
  maxTokens: number;
  temperature: number;
  strengths: string[];
  status: 'ready' | 'gated' | 'pending-auth';
  authType?: 'api-key' | 'bearer';
  reasoning?: boolean;
  serverless?: boolean;
  provider: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  worker: string;
  workerName: string;
  content: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  elapsed_ms: number;
  model: string;
}

export interface TaskRow {
  id: string;
  type: string;
  model: string | null;
  provider: string | null;
  status: string;
  input: string | null;
  output: string | null;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface BuildJobRow {
  id: string;
  engine_id: string;
  tier: string | null;
  status: string;
  worker_model: string | null;
  lines_generated: number;
  output_r2_key: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DispatchRequest {
  worker: string;
  task: string;
  context?: string;
  model?: string;
  maxTokens?: number;
}

export interface BuildRequest {
  worker: string;
  engineId: string;
  engineName: string;
  domain?: string;
  tier?: string;
  port?: number;
  context?: string;
  engineDescription?: string;
}

export interface AutoSelectResult {
  id: string;
  name: string;
  model: string;
  score: number;
  provider: string;
}
