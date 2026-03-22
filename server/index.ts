import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import documentRoutes from './routes/documents.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', chatRoutes);
app.use('/api/documents', documentRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Nano Office server running on http://localhost:${PORT}`);
  console.log('Using Claude CLI for AI responses (no API key needed)');
});
