import type { Env, ChatMessage } from './types';
import { getWorkers, getWorkerById, callWorker } from './providers';

interface BuildMessage {
  jobId: string;
  engineId: string;
  engineName: string;
  domain?: string;
  tier?: string;
  workerId: string;
  context?: string;
  engineDescription?: string;
}

function getBuildSystemPrompt(context: string): string {
  return `You are a coding worker for ECHO OMEGA PRIME. You receive tasks from Claude (the architect).

RULES:
1. Output ONLY code or direct answers. No preamble, no disclaimers, no explanations unless asked.
2. Follow the task instructions exactly.
3. Use Python 3.11+ with type hints, loguru logging, Pydantic models.
4. Use FastAPI for any web services.
5. No placeholders, no TODOs, no stubs. Every function fully implemented.
6. If writing a file, output the COMPLETE file content — never partial.

TASK CONTEXT:
${context || 'No additional context.'}`;
}

export async function handleBuildQueue(
  batch: MessageBatch<BuildMessage>,
  env: Env
): Promise<void> {
  const workers = getWorkers();

  for (const msg of batch.messages) {
    const { jobId, engineId, engineName, domain, workerId, context, engineDescription } = msg.body;

    try {
      // Update job status to building
      await env.DB.prepare(
        `UPDATE build_jobs SET status = 'building', worker_model = ? WHERE id = ?`
      ).bind(workerId, jobId).run();

      const worker = getWorkerById(workers, workerId);
      if (!worker) throw new Error(`Unknown worker: ${workerId}`);

      const buildPrompt = `Build a complete TIE-grade engine for ECHO OMEGA PRIME.

ENGINE: ${engineId} — ${engineName}
DOMAIN: ${domain || 'general'}

REQUIREMENTS (TIE-20 STANDARD):
- FastAPI server with CORS, health endpoint, metrics endpoint
- Pydantic models for all input/output
- Loguru logging (never print)
- Doctrine cache with 50+ real domain-specific reasoning blocks
- SHA-256 determinism hash on every response
- Telemetry tracking (latency, query count, error rate)
- Type hints on all functions
- config.json with port, name, version, features

OUTPUT: Complete engine.py file. Production ready. No stubs. No TODOs.

${engineDescription || ''}
${context || ''}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: getBuildSystemPrompt(context || '') },
        { role: 'user', content: buildPrompt },
      ];

      const result = await callWorker(worker, messages, env, { maxTokens: 16384 });

      // Extract code from markdown blocks if present
      let code = result.content;
      const codeMatch = code.match(/```python\n([\s\S]*?)```/);
      if (codeMatch) code = codeMatch[1];

      const lines = code.split('\n').length;

      // Store to R2
      const r2Key = `engines/${engineId}/engine.py`;
      await env.R2.put(r2Key, code, {
        customMetadata: {
          engineId, engineName, worker: workerId,
          model: result.model, lines: String(lines),
          built_at: new Date().toISOString(),
        },
      });

      // Update D1
      await env.DB.prepare(
        `UPDATE build_jobs SET status = 'complete', lines_generated = ?, output_r2_key = ?, completed_at = datetime('now') WHERE id = ?`
      ).bind(lines, r2Key, jobId).run();

      // Update worker stats
      await env.DB.prepare(
        `INSERT INTO worker_stats (provider, model, total_requests, total_tokens, avg_latency_ms, last_used, status)
         VALUES (?, ?, 1, ?, ?, datetime('now'), 'active')
         ON CONFLICT(provider, model) DO UPDATE SET
           total_requests = total_requests + 1,
           total_tokens = total_tokens + ?,
           avg_latency_ms = (avg_latency_ms * total_requests + ?) / (total_requests + 1),
           last_used = datetime('now')`
      ).bind(
        worker.provider, worker.model,
        result.usage.total_tokens || 0, result.elapsed_ms,
        result.usage.total_tokens || 0, result.elapsed_ms
      ).run();

      // Log task
      await env.DB.prepare(
        `INSERT INTO tasks (id, type, model, provider, status, input, output, tokens_in, tokens_out, latency_ms, completed_at)
         VALUES (?, 'build', ?, ?, 'complete', ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        jobId, worker.model, worker.provider,
        `Build ${engineId}: ${engineName}`,
        `${lines} lines, stored at ${r2Key}`,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0,
        result.elapsed_ms
      ).run();

      msg.ack();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await env.DB.prepare(
        `UPDATE build_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
      ).bind(errMsg.slice(0, 1000), jobId).run();

      // Retry or DLQ
      msg.retry({ delaySeconds: 30 });
    }
  }
}
