import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { initDb, addLogEntry } from './server/database.js';

// Import Routes
import employeeRoutes from './server/routes/employees.js';
import movementRoutes from './server/routes/movements.js';
import configRoutes from './server/routes/config.js';
import emailRoutes from './server/routes/email.js';
import logsRoutes from './server/routes/logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  // --- Initialize Database ---
  initDb();

  // --- Middleware ---
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Request Logger (DB Integration)
  app.use((req, res, next) => {
    if (!req.url.includes('/api/health') && !req.url.includes('/api/logs')) {
      const method = req.method;
      if (method !== 'GET' || req.url.includes('/download') || req.url.includes('/backup')) {
        addLogEntry('INFO', `API Request: ${method} ${req.url}`);
      }
    }
    next();
  });

  // Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- API Routes ---
  app.use('/api/employees', employeeRoutes);
  app.use('/api/movements', movementRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/email-report', emailRoutes);
  app.use('/api/logs', logsRoutes);

  // Static Route for Favicon
  app.get('/favicon.png', (req, res) => {
    const faviconPath = path.join(__dirname, 'data', 'favicon.png');
    res.sendFile(faviconPath, (err) => {
      if (err) res.status(404).end();
    });
  });

  // Explicit API 404 Handler
  app.all('/api/*', (req, res) => {
    addLogEntry('WARN', `404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // --- Serve Frontend ---
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, 'dist', 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) res.send('App is building or dist folder missing.');
      });
    });
  }

  // Error Handler Middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    addLogEntry('ERROR', `Uncaught Exception: ${err.message}`, err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // --- Start Server ---
  app.listen(PORT, '0.0.0.0', () => {
    const msg = `🚀 Server running on port ${PORT} (0.0.0.0)`;
    console.log(msg);
    addLogEntry('INFO', 'Server gestartet', msg);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
});
