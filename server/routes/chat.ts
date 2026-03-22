import { Router, Request, Response } from 'express';
import { startRoundtable, continueDiscussion, finalizeDocuments, stopAll } from '../agents/orchestrator.js';
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
  const { task } = req.body;
  if (!task || typeof task !== 'string') {
    res.status(400).json({ error: 'Task is required' });
    return;
  }
  if (store.isProcessing) {
    res.status(409).json({ error: 'A task is already being processed' });
    return;
  }
  res.json({ status: 'accepted', task });
  startRoundtable(task, broadcast).catch(err => {
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

// Finalize and generate documents
router.post('/finalize', async (_req: Request, res: Response) => {
  if (store.isProcessing) {
    res.status(409).json({ error: 'Already processing' });
    return;
  }
  res.json({ status: 'finalizing' });
  finalizeDocuments(broadcast).catch(err => {
    console.error('Finalize error:', err);
    broadcast({ type: 'error', message: err.message });
  });
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

export default router;
