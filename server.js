import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { initDb } from './server/database.js';

// Import Routes
import employeeRoutes from './server/routes/employees.js';
import movementRoutes from './server/routes/movements.js';
import configRoutes from './server/routes/config.js';
import emailRoutes from './server/routes/email.js';

// ES Module paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// --- Initialize Database ---
initDb();

// --- Middleware ---
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- API Routes ---
app.use('/api/employees', employeeRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/config', configRoutes);
app.use('/api/email-report', emailRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static Route for Favicon (served from data dir for persistence/customization if needed)
app.get('/favicon.png', (req, res) => {
  const faviconPath = path.join(__dirname, 'data', 'favicon.png');
  res.sendFile(faviconPath, (err) => {
    if (err) res.status(404).end();
  });
});

// Explicit API 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.url}` });
});

// --- Serve Frontend ---
app.use(express.static(path.join(__dirname, 'dist')));

// Catch all for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexPath, (err) => {
      if(err) res.send('App is building or dist folder missing.');
  });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (0.0.0.0)`);
});