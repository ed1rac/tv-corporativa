import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastScreenReload } from '../services/websocket.js';

const router = Router();

// List all displays
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const displays = await db.all(`
      SELECT d.*, l.name as layout_name, l.aspect_ratio, p.name as playlist_name
      FROM displays d
      LEFT JOIN layouts l ON d.layout_id = l.id
      LEFT JOIN playlists p ON d.playlist_id = p.id
      ORDER BY d.code ASC
    `);
    res.json({ displays });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single display by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const display = await db.get(`
      SELECT d.*, l.name as layout_name, p.name as playlist_name
      FROM displays d
      LEFT JOIN layouts l ON d.layout_id = l.id
      LEFT JOIN playlists p ON d.playlist_id = p.id
      WHERE d.id = ?
    `, [id]);

    if (!display) {
      res.status(404).json({ error: 'Tela não encontrada.' });
      return;
    }

    res.json({ display });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get display by code (Public for Player)
router.get('/code/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const display = await db.get(`
      SELECT d.*, l.name as layout_name, l.aspect_ratio, l.config_json
      FROM displays d
      LEFT JOIN layouts l ON d.layout_id = l.id
      WHERE UPPER(d.code) = ?
    `, [code]);

    if (!display) {
      res.status(404).json({ error: `Tela com código "${code}" não encontrada.` });
      return;
    }

    // Parse layout config
    let layoutConfig = null;
    if (display.config_json) {
      try {
        layoutConfig = JSON.parse(display.config_json);
      } catch (e) {
        console.error('Error parsing layout JSON:', e);
      }
    }

    // Get assigned playlist or fallback to first playlist
    let playlist = null;
    if (display.playlist_id) {
      playlist = await db.get('SELECT * FROM playlists WHERE id = ?', [display.playlist_id]);
    }
    if (!playlist) {
      playlist = await db.get('SELECT * FROM playlists LIMIT 1');
    }

    let items: any[] = [];
    if (playlist) {
      items = await db.all(`
        SELECT pi.*, m.filename, m.original_name, m.media_type, m.storage_path, m.duration_seconds as media_duration
        FROM playlist_items pi
        LEFT JOIN media m ON pi.media_id = m.id
        WHERE pi.playlist_id = ? AND pi.is_active = 1
        ORDER BY pi.order_num ASC
      `, [playlist.id]);
    }

    // Fetch system settings for player header/color/announcements
    const settingsRows = await db.all('SELECT key, value FROM system_settings');
    const settings: Record<string, string> = {};
    settingsRows.forEach((r) => {
      settings[r.key] = r.value;
    });

    res.json({
      display: {
        id: display.id,
        name: display.name,
        code: display.code,
        layout_id: display.layout_id,
        playlist_id: playlist ? playlist.id : null,
        orientation: display.orientation,
        resolution: display.resolution,
        location: display.location,
        show_header: display.show_header !== undefined ? Boolean(display.show_header) : true,
        status: display.status
      },
      layout: {
        id: display.layout_id,
        name: display.layout_name,
        aspect_ratio: display.aspect_ratio,
        config: layoutConfig
      },
      playlist: {
        id: playlist ? playlist.id : null,
        name: playlist ? playlist.name : 'Nenhuma playlist',
        items
      },
      settings
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create display
router.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, layout_id, playlist_id, orientation, resolution, location, show_header } = req.body;

    if (!name || !code) {
      res.status(400).json({ error: 'Nome e código da tela são obrigatórios.' });
      return;
    }

    const cleanCode = String(code).trim().toUpperCase();
    const existing = await db.get('SELECT id FROM displays WHERE UPPER(code) = ?', [cleanCode]);
    if (existing) {
      res.status(400).json({ error: `O código de tela "${cleanCode}" já está em uso.` });
      return;
    }

    const id = randomUUID();
    const showHeaderVal = show_header !== undefined ? (show_header ? 1 : 0) : 1;

    await db.run(`
      INSERT INTO displays (id, name, code, layout_id, playlist_id, orientation, resolution, location, show_header, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline')
    `, [
      id,
      name.trim(),
      cleanCode,
      layout_id || 'layout-corporate-news',
      playlist_id || 'playlist-default',
      orientation || 'landscape',
      resolution || '1920x1080',
      location || '',
      showHeaderVal
    ]);

    const newDisplay = await db.get('SELECT * FROM displays WHERE id = ?', [id]);
    res.status(201).json({ message: 'Tela cadastrada com sucesso.', display: newDisplay });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update display
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, code, layout_id, playlist_id, orientation, resolution, location, show_header } = req.body;

    const display = await db.get('SELECT * FROM displays WHERE id = ?', [id]);
    if (!display) {
      res.status(404).json({ error: 'Tela não encontrada.' });
      return;
    }

    const cleanCode = code ? String(code).trim().toUpperCase() : display.code;
    const showHeaderVal = show_header !== undefined ? (show_header ? 1 : 0) : display.show_header;

    await db.run(`
      UPDATE displays
      SET name = ?, code = ?, layout_id = ?, playlist_id = ?, orientation = ?, resolution = ?, location = ?, show_header = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name ? name.trim() : display.name,
      cleanCode,
      layout_id !== undefined ? layout_id : display.layout_id,
      playlist_id !== undefined ? playlist_id : display.playlist_id,
      orientation || display.orientation,
      resolution || display.resolution,
      location !== undefined ? location : display.location,
      showHeaderVal,
      id
    ]);

    // Notify connected player via WebSocket
    broadcastScreenReload(display.code);
    if (cleanCode !== display.code) {
      broadcastScreenReload(cleanCode);
    }

    const updated = await db.get('SELECT * FROM displays WHERE id = ?', [id]);
    res.json({ message: 'Tela atualizada com sucesso.', display: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger reload for a display
router.post('/:code/reload', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    broadcastScreenReload(code.toUpperCase());
    res.json({ message: `Sinal de recarregamento transmitido para a tela ${code}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete display
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM displays WHERE id = ?', [id]);
    res.json({ message: 'Tela removida com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
