import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, ChatMessage, DispatchRequest, BuildRequest } from './types';
import { getWorkers, getWorkerById, callWorker, getReadyWorkers } from './providers';
import { autoSelect } from './auto-select';
import { handleBuildQueue } from './queue-consumer';

type HonoEnv = { Bindings: Env };
const app = new Hono<HonoEnv>();

app.use('*', cors());

// ─── Auth middleware for write endpoints ──────────────────────
app.use('/dispatch', async (c, next) => {
  const key = c.req.header('X-Echo-API-Key');
  if (key && key !== c.env.ECHO_API_KEY) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// ─── D1 Schema Init ──────────────────────────────────────────
async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      model TEXT,
      provider TEXT,
      status TEXT DEFAULT 'pending',
      input TEXT,
      output TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      latency_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS build_jobs (
      id TEXT PRIMARY KEY,
      engine_id TEXT NOT NULL,
      tier TEXT,
      status TEXT DEFAULT 'queued',
      worker_model TEXT,
      lines_generated INTEGER DEFAULT 0,
      output_r2_key TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS worker_stats (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      total_requests INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      avg_latency_ms REAL DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_used TEXT,
      status TEXT DEFAULT 'active',
      PRIMARY KEY (provider, model)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dispatch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      provider TEXT,
      model TEXT,
      strategy TEXT,
      score REAL,
      selected INTEGER DEFAULT 0,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`),
  ]);
}

// ─── Helper: log task to D1 ──────────────────────────────────
async function logTask(
  db: D1Database,
  params: {
    id: string; type: string; model?: string; provider?: string;
    status: string; input?: string; output?: string;
    tokens_in?: number; tokens_out?: number; latency_ms?: number;
  }
): Promise<void> {
  await db.prepare(
    `INSERT INTO tasks (id, type, model, provider, status, input, output, tokens_in, tokens_out, latency_ms, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${params.status === 'complete' ? "datetime('now')" : 'NULL'})`
  ).bind(
    params.id, params.type, params.model || null, params.provider || null,
    params.status, params.input || null, params.output || null,
    params.tokens_in || 0, params.tokens_out || 0, params.latency_ms || null,
  ).run();
}

// ─── Helper: update worker stats ─────────────────────────────
async function updateWorkerStats(
  db: D1Database,
  provider: string, model: string,
  tokens: number, latency: number, isError: boolean
): Promise<void> {
  if (isError) {
    await db.prepare(
      `INSERT INTO worker_stats (provider, model, error_count, last_used, status)
       VALUES (?, ?, 1, datetime('now'), 'active')
       ON CONFLICT(provider, model) DO UPDATE SET
         error_count = error_count + 1, last_used = datetime('now')`
    ).bind(provider, model).run();
  } else {
    await db.prepare(
      `INSERT INTO worker_stats (provider, model, total_requests, total_tokens, avg_latency_ms, last_used, status)
       VALUES (?, ?, 1, ?, ?, datetime('now'), 'active')
       ON CONFLICT(provider, model) DO UPDATE SET
         total_requests = total_requests + 1,
         total_tokens = total_tokens + ?,
         avg_latency_ms = (avg_latency_ms * total_requests + ?) / (total_requests + 1),
         last_used = datetime('now')`
    ).bind(provider, model, tokens, latency, tokens, latency).run();
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /health
// ═══════════════════════════════════════════════════════════════
app.get('/health', async (c) => {
  const workers = getWorkers();
  const ready = getReadyWorkers(workers, c.env);
  let taskCount = 0;
  let buildCount = 0;
  try {
    const tc = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM tasks').first<{ cnt: number }>();
    const bc = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM build_jobs').first<{ cnt: number }>();
    taskCount = tc?.cnt ?? 0;
    buildCount = bc?.cnt ?? 0;
  } catch { /* schema may not exist yet */ }

  return c.json({
    status: 'operational',
    service: 'echo-ai-orchestrator',
    version: '1.0.0',
    workers_total: workers.length,
    workers_ready: ready.length,
    tasks_total: taskCount,
    builds_total: buildCount,
    uptime: 'cloudflare-worker',
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /workers
// ═══════════════════════════════════════════════════════════════
app.get('/workers', (c) => {
  const workers = getWorkers();
  return c.json(workers.map(w => ({
    id: w.id,
    name: w.name,
    model: w.model,
    provider: w.provider,
    hasKey: !!c.env[w.apiKeyEnv],
    strengths: w.strengths,
    status: w.status,
    reasoning: w.reasoning ?? false,
    serverless: w.serverless ?? false,
  })));
});

// ═══════════════════════════════════════════════════════════════
// GET /models
// ═══════════════════════════════════════════════════════════════
app.get('/models', (c) => {
  const workers = getWorkers();
  const groups: Record<string, typeof workers> = {};
  for (const w of workers) {
    if (!groups[w.provider]) groups[w.provider] = [];
    groups[w.provider].push(w);
  }
  const total = workers.length;
  const ready = getReadyWorkers(workers, c.env).length;
  return c.json({ total, ready, groups });
});

// ═══════════════════════════════════════════════════════════════
// POST /auto-select
// ═══════════════════════════════════════════════════════════════
app.post('/auto-select', async (c) => {
  const body = await c.req.json<{ task: string; limit?: number }>();
  if (!body.task) return c.json({ error: 'task is required' }, 400);

  const workers = getWorkers();
  const results = autoSelect(workers, c.env, { task: body.task });
  return c.json({ task: body.task, recommendations: results.slice(0, body.limit || 5) });
});

// Also support GET for backward compatibility
app.get('/auto-select', (c) => {
  const task = c.req.query('task') || 'coding';
  const workers = getWorkers();
  const results = autoSelect(workers, c.env, { task });
  return c.json({ task, recommendations: results.slice(0, 5) });
});

// ═══════════════════════════════════════════════════════════════
// POST /dispatch — Single worker dispatch
// ═══════════════════════════════════════════════════════════════
app.post('/dispatch', async (c) => {
  const body = await c.req.json<DispatchRequest>();
  if (!body.worker || !body.task) return c.json({ error: 'worker and task are required' }, 400);

  const workers = getWorkers();
  const worker = getWorkerById(workers, body.worker);
  if (!worker) return c.json({ error: `Unknown worker: ${body.worker}` }, 404);

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await ensureSchema(c.env.DB);

    const messages: ChatMessage[] = [
      { role: 'system', content: `You are a coding worker for ECHO OMEGA PRIME.\n\nRULES:\n1. Output ONLY code or direct answers.\n2. Follow task instructions exactly.\n3. Python 3.11+ with type hints, loguru, Pydantic.\n4. No placeholders, no TODOs.\n\n${body.context || ''}` },
      { role: 'user', content: body.task },
    ];

    const result = await callWorker(worker, messages, c.env, { model: body.model, maxTokens: body.maxTokens });

    // Log to D1
    await logTask(c.env.DB, {
      id: taskId, type: 'dispatch', model: worker.model, provider: worker.provider,
      status: 'complete', input: body.task.slice(0, 2000), output: result.content.slice(0, 5000),
      tokens_in: result.usage.prompt_tokens, tokens_out: result.usage.completion_tokens,
      latency_ms: result.elapsed_ms,
    });
    await updateWorkerStats(c.env.DB, worker.provider, worker.model, result.usage.total_tokens || 0, result.elapsed_ms, false);

    // Log dispatch selection
    await c.env.DB.prepare(
      `INSERT INTO dispatch_log (task_id, provider, model, strategy, score, selected, reason) VALUES (?, ?, ?, 'direct', 0, 1, 'user-specified')`
    ).bind(taskId, worker.provider, worker.model).run();

    return c.json({
      taskId,
      status: 'completed',
      worker: result.workerName,
      model: result.model,
      elapsed_ms: result.elapsed_ms,
      outputLength: result.content.length,
      usage: result.usage,
      preview: result.content.slice(0, 1000),
      content: result.content,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateWorkerStats(c.env.DB, worker.provider, worker.model, 0, 0, true).catch(() => {});
    await logTask(c.env.DB, {
      id: taskId, type: 'dispatch', model: worker.model, provider: worker.provider,
      status: 'failed', input: body.task.slice(0, 2000), output: errMsg.slice(0, 2000),
    }).catch(() => {});
    return c.json({ taskId, status: 'failed', error: errMsg }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /dispatch-parallel — Fan-out to multiple workers
// ═══════════════════════════════════════════════════════════════
app.post('/dispatch-parallel', async (c) => {
  const body = await c.req.json<{ workers: string[]; task: string; context?: string }>();
  if (!body.workers?.length || !body.task) return c.json({ error: 'workers[] and task required' }, 400);

  const allWorkers = getWorkers();
  const messages: ChatMessage[] = [
    { role: 'system', content: `You are a coding worker for ECHO OMEGA PRIME. Output ONLY code or direct answers.\n\n${body.context || ''}` },
    { role: 'user', content: body.task },
  ];

  const results = await Promise.allSettled(
    body.workers.map(wId => {
      const w = getWorkerById(allWorkers, wId);
      if (!w) return Promise.reject(new Error(`Unknown worker: ${wId}`));
      return callWorker(w, messages, c.env);
    })
  );

  const output = body.workers.map((wId, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      return {
        worker: wId, status: 'completed', model: r.value.model,
        elapsed_ms: r.value.elapsed_ms, outputLength: r.value.content.length,
        preview: r.value.content.slice(0, 500),
      };
    }
    return { worker: wId, status: 'failed', error: r.reason?.message || 'Unknown error' };
  });

  return c.json({ task: body.task, results: output });
});

// ═══════════════════════════════════════════════════════════════
// POST /chat — Direct conversation with a worker
// ═══════════════════════════════════════════════════════════════
app.post('/chat', async (c) => {
  const body = await c.req.json<{ worker: string; messages: ChatMessage[]; model?: string }>();
  if (!body.worker || !body.messages) return c.json({ error: 'worker and messages required' }, 400);

  const workers = getWorkers();
  const worker = getWorkerById(workers, body.worker);
  if (!worker) return c.json({ error: `Unknown worker: ${body.worker}` }, 404);

  try {
    const result = await callWorker(worker, body.messages, c.env, { model: body.model });
    return c.json(result);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /review — Code review endpoint
// ═══════════════════════════════════════════════════════════════
app.post('/review', async (c) => {
  const body = await c.req.json<{ worker: string; code: string; filepath?: string; instructions?: string }>();
  if (!body.worker || !body.code) return c.json({ error: 'worker and code required' }, 400);

  const workers = getWorkers();
  const worker = getWorkerById(workers, body.worker);
  if (!worker) return c.json({ error: `Unknown worker: ${body.worker}` }, 404);

  const reviewPrompt = `Review the following code and provide:
1. A quality score (1-10)
2. Bugs or issues found
3. Suggestions for improvement
4. Whether it meets production quality standards

${body.instructions ? `Additional instructions: ${body.instructions}` : ''}

${body.filepath ? `FILE: ${body.filepath}` : ''}
\`\`\`
${body.code}
\`\`\``;

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an expert code reviewer. Be concise, specific, and actionable.' },
    { role: 'user', content: reviewPrompt },
  ];

  try {
    const result = await callWorker(worker, messages, c.env);
    return c.json({
      filepath: body.filepath,
      reviewer: result.workerName,
      model: result.model,
      elapsed_ms: result.elapsed_ms,
      review: result.content,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /build-engine — Queue-backed async builds
// ═══════════════════════════════════════════════════════════════
app.post('/build-engine', async (c) => {
  const body = await c.req.json<BuildRequest>();
  if (!body.worker || !body.engineId || !body.engineName) {
    return c.json({ error: 'worker, engineId, and engineName required' }, 400);
  }

  await ensureSchema(c.env.DB);

  const jobId = `build_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Insert job record
  await c.env.DB.prepare(
    `INSERT INTO build_jobs (id, engine_id, tier, status, worker_model) VALUES (?, ?, ?, 'queued', ?)`
  ).bind(jobId, body.engineId, body.tier || null, body.worker).run();

  // Enqueue to Cloudflare Queue
  await c.env.BUILD_QUEUE.send({
    jobId,
    engineId: body.engineId,
    engineName: body.engineName,
    domain: body.domain,
    tier: body.tier,
    workerId: body.worker,
    context: body.context,
    engineDescription: body.engineDescription,
  });

  return c.json({
    jobId,
    status: 'queued',
    engineId: body.engineId,
    engineName: body.engineName,
    worker: body.worker,
    message: `Build queued. Poll GET /build-engine/${jobId} for status.`,
    poll_url: `/build-engine/${jobId}`,
  }, 202);
});

// GET /build-engine/:jobId — Poll build status
app.get('/build-engine/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const job = await c.env.DB.prepare(
    `SELECT * FROM build_jobs WHERE id = ?`
  ).bind(jobId).first();

  if (!job) return c.json({ error: 'Job not found', jobId }, 404);
  return c.json(job);
});

// ═══════════════════════════════════════════════════════════════
// POST /relay — Store content to Shared Brain
// ═══════════════════════════════════════════════════════════════
app.post('/relay', async (c) => {
  const body = await c.req.json<{
    instance_id?: string; role?: string; content: string;
    importance?: number; tags?: string[];
  }>();
  if (!body.content) return c.json({ error: 'content required' }, 400);

  try {
    const resp = await fetch('https://echo-shared-brain.bmcii1976.workers.dev/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: body.instance_id || 'orchestrator_cloud',
        role: body.role || 'assistant',
        content: body.content.slice(0, 10000),
        importance: body.importance || 5,
        tags: body.tags || ['relay'],
        metadata: { relayed_via: 'echo-ai-orchestrator', relayed_at: new Date().toISOString() },
      }),
    });
    const result = await resp.json();
    return c.json({ relayed: true, ...result as Record<string, unknown> });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /stats — Usage statistics from D1
// ═══════════════════════════════════════════════════════════════
app.get('/stats', async (c) => {
  try {
    await ensureSchema(c.env.DB);
    const [tasks, builds, workers, recent] = await Promise.all([
      c.env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        AVG(latency_ms) as avg_latency_ms
        FROM tasks`).first(),
      c.env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
        SUM(lines_generated) as total_lines
        FROM build_jobs`).first(),
      c.env.DB.prepare(`SELECT * FROM worker_stats ORDER BY total_requests DESC`).all(),
      c.env.DB.prepare(`SELECT id, type, model, provider, status, latency_ms, created_at FROM tasks ORDER BY created_at DESC LIMIT 20`).all(),
    ]);

    return c.json({ tasks, builds, worker_stats: workers.results, recent_tasks: recent.results });
  } catch {
    return c.json({ tasks: {}, builds: {}, worker_stats: [], recent_tasks: [] });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /tasks — Recent task history
// ═══════════════════════════════════════════════════════════════
app.get('/tasks', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const status = c.req.query('status');

  try {
    await ensureSchema(c.env.DB);
    let query = 'SELECT * FROM tasks';
    const binds: string[] = [];
    if (status) {
      query += ' WHERE status = ?';
      binds.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    binds.push(String(limit));

    const stmt = c.env.DB.prepare(query);
    const result = binds.length === 2
      ? await stmt.bind(binds[0], parseInt(binds[1])).all()
      : await stmt.bind(parseInt(binds[0])).all();

    return c.json({ total: result.results.length, tasks: result.results });
  } catch {
    return c.json({ total: 0, tasks: [] });
  }
});

// GET /tasks/:id
app.get('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json(task);
  } catch {
    return c.json({ error: 'Database error' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// Schema init endpoint
// ═══════════════════════════════════════════════════════════════
app.post('/init-schema', async (c) => {
  try {
    await ensureSchema(c.env.DB);
    return c.json({ ok: true, message: 'Schema initialized' });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════════
app.get('/', (c) => {
  return c.json({
    service: 'echo-ai-orchestrator',
    version: '1.0.0',
    description: 'ECHO PRIME Multi-AI Orchestrator — 30 LLM workers, smart dispatch, async builds',
    endpoints: [
      'GET  /health',
      'GET  /workers',
      'GET  /models',
      'POST /auto-select',
      'GET  /auto-select?task=coding',
      'POST /dispatch',
      'POST /dispatch-parallel',
      'POST /chat',
      'POST /review',
      'POST /build-engine',
      'GET  /build-engine/:jobId',
      'POST /relay',
      'GET  /stats',
      'GET  /tasks',
      'GET  /tasks/:id',
      'POST /init-schema',
    ],
  });
});

// ═══════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleBuildQueue(batch, env);
  },
};
