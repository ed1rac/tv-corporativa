import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import displayRoutes from './routes/displays.js';
import layoutRoutes from './routes/layouts.js';
import playlistRoutes from './routes/playlists.js';
import mediaRoutes from './routes/media.js';
import widgetRoutes from './routes/widgets.js';
import queueRoutes from './routes/queue.js';
import settingsRoutes from './routes/settings.js';
import { config } from './config/index.js';

const app = express();

// Basic middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded media files directly
app.use('/media', express.static(config.mediaPath));

// Serve frontend static assets
const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/displays', displayRoutes);
app.use('/api/layouts', layoutRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/settings', settingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0'
  });
});

// Player route alias
app.get('/player', (req, res) => {
  res.sendFile(path.join(publicPath, 'player.html'));
});

// Admin CMS route alias
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

export default app;
