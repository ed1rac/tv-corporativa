import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { broadcastScreenReload } from '../services/websocket.js';

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

// Update settings
router.put('/', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settings } = req.body; // { key: value, ... }

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Objeto de configurações inválido.' });
      return;
    }

    for (const [key, value] of Object.entries(settings)) {
      await db.run(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `, [key, String(value)]);
    }

    // Notify connected displays to apply new theme/settings
    broadcastScreenReload();

    res.json({ message: 'Configurações atualizadas com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
