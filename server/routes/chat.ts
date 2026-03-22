import { Router, Request, Response } from 'express';
import { startRoundtable, continueDiscussion, finalizeDocuments, stopAll, hasDiscussionContent, generateProject, addCeoMessage } from '../agents/orchestrator.js';
import { store } from '../store.js';
import { SSEEvent } from '../agents/types.js';

const router = Router();

const sseClients: Set<Response> = new Set();

function broadcast(event: SSEEvent) {
  const data = JSON.stringify(event);
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

// SSE endpoint
router.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => { res.write(':keepalive\n\n'); }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Start new meeting
router.post('/task', async (req: Request, res: Response) => {
  const { task, departments } = req.body;
  if (!task || typeof task !== 'string') {
    res.status(400).json({ error: 'Task is required' });
    return;
  }
  if (store.isProcessing) {
    res.status(409).json({ error: 'A task is already being processed' });
    return;
  }
  // departments: optional string[] e.g. ['marketing'], ['development'], ['marketing','development']
  const depts = Array.isArray(departments) && departments.length > 0 ? departments : undefined;
  res.json({ status: 'accepted', task });
  startRoundtable(task, broadcast, depts).catch(err => {
    console.error('Roundtable error:', err);
    broadcast({ type: 'error', message: err.message });
  });
});

// Continue discussion (another round)
router.post('/continue', async (_req: Request, res: Response) => {
  if (store.isProcessing) {
    res.status(409).json({ error: 'Already processing' });
    return;
  }
  res.json({ status: 'continuing' });
  continueDiscussion(broadcast).catch(err => {
    console.error('Continue error:', err);
    broadcast({ type: 'error', message: err.message });
  });
});

// Finalize and generate documents (works even after stop if there's content)
router.post('/finalize', async (_req: Request, res: Response) => {
  if (store.isProcessing) {
    res.status(409).json({ error: 'Already processing' });
    return;
  }
  if (!hasDiscussionContent()) {
    res.status(400).json({ error: 'No discussion content to finalize' });
    return;
  }
  res.json({ status: 'finalizing' });
  finalizeDocuments(broadcast).catch(err => {
    console.error('Finalize error:', err);
    broadcast({ type: 'error', message: err.message });
  });
});

// Generate project (after user confirms)
router.post('/generate-project', async (_req: Request, res: Response) => {
  if (store.isProcessing) {
    res.status(409).json({ error: 'Already processing' });
    return;
  }
  res.json({ status: 'generating' });
  generateProject(broadcast).catch(err => {
    console.error('Project generation error:', err);
    broadcast({ type: 'error', message: err.message });
  });
});

// CEO message during meeting
router.post('/ceo-message', (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message required' });
    return;
  }
  addCeoMessage(message, broadcast);
  res.json({ status: 'sent' });
});

// Stop everything
router.post('/stop', (_req: Request, res: Response) => {
  stopAll();
  res.json({ status: 'stopped' });
});

// Get transcript
router.get('/transcript', (_req: Request, res: Response) => {
  res.json(store.transcript);
});

// Session history
router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = store.getHistory().map(s => ({
    id: s.id,
    task: s.task,
    timestamp: s.timestamp,
    agentCount: new Set(s.transcript.map(t => t.agentId)).size,
  }));
  res.json(sessions);
});

router.get('/sessions/:id', (req: Request, res: Response) => {
  const session = store.getSessionById(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

export default router;
