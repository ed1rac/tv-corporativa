import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastScreenReload } from '../services/websocket.js';
import { clearRssCache } from '../services/rss.js';

const router = Router();

// Get settings
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.all('SELECT key, value, description FROM system_settings');
    const settings: Record<string, string> = {};
    rows.forEach((r) => {
      settings[r.key] = r.value;
    });
    res.json({ settings, list: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings (including announcements, company branding, RSS & weather)
// Supports both { settings: { key: val } } and flat { key: val }
router.put('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawBody = req.body;
    const settings =
      rawBody && typeof rawBody.settings === 'object' && !Array.isArray(rawBody.settings)
        ? rawBody.settings
        : rawBody;

    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length === 0) {
      res.status(400).json({ error: 'Objeto de configurações inválido.' });
      return;
    }

    for (const [key, value] of Object.entries(settings)) {
      await db.run(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `, [key, String(value ?? '')]);
    }

    if (settings.rss_feed_url !== undefined) {
      clearRssCache();
    }

    // Notify connected displays to apply new theme/settings/announcements
    broadcastScreenReload();

    res.json({ message: 'Configurações atualizadas com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force reload all screens or a specific screen via WebSocket
router.post('/reload-screens', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { screenCode } = req.body || {};
    broadcastScreenReload(screenCode);
    res.json({ message: 'Sinal de recarregamento enviado para as telas.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
