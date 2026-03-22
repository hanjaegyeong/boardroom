import { Router, Request, Response } from 'express';
import { store } from '../store.js';

const router = Router();

// Get all documents
router.get('/', (_req: Request, res: Response) => {
  res.json(store.documents.map(doc => ({
    id: doc.id,
    agentId: doc.agentId,
    agentTitle: doc.agentTitle,
    agentName: doc.agentName,
    title: doc.title,
    timestamp: doc.timestamp,
  })));
});

// Get specific document
router.get('/:id', (req: Request, res: Response) => {
  const doc = store.documents.find(d => d.id === req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(doc);
});

export default router;
