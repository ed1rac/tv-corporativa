import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastScreenReload } from '../services/websocket.js';

const router = Router();

// List all layouts
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const layouts = await db.all(`SELECT * FROM layouts ORDER BY name ASC`);
    const parsed = layouts.map((l) => ({
      ...l,
      config: JSON.parse(l.config_json)
    }));
    res.json({ layouts: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get layout by id
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const layout = await db.get(`SELECT * FROM layouts WHERE id = ?`, [id]);
    if (!layout) {
      res.status(404).json({ error: 'Layout não encontrado.' });
      return;
    }
    res.json({
      layout: {
        ...layout,
        config: JSON.parse(layout.config_json)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create layout
router.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, aspect_ratio, description, config } = req.body;

    if (!name || !config) {
      res.status(400).json({ error: 'Nome e configuração do layout são obrigatórios.' });
      return;
    }

    const id = randomUUID();
    const configString = typeof config === 'string' ? config : JSON.stringify(config);

    await db.run(`
      INSERT INTO layouts (id, name, aspect_ratio, description, config_json)
      VALUES (?, ?, ?, ?, ?)
    `, [id, name, aspect_ratio || '16:9', description || '', configString]);

    const created = await db.get('SELECT * FROM layouts WHERE id = ?', [id]);
    res.status(201).json({
      message: 'Layout criado com sucesso.',
      layout: { ...created, config: JSON.parse(created.config_json) }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update layout
router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, aspect_ratio, description, config } = req.body;

    const existing = await db.get('SELECT * FROM layouts WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Layout não encontrado.' });
      return;
    }

    const configString = typeof config === 'string' ? config : JSON.stringify(config);

    await db.run(`
      UPDATE layouts
      SET name = ?, aspect_ratio = ?, description = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, aspect_ratio || '16:9', description || '', configString, id]);

    // Notify all screens
    broadcastScreenReload();

    const updated = await db.get('SELECT * FROM layouts WHERE id = ?', [id]);
    res.json({
      message: 'Layout atualizado com sucesso.',
      layout: { ...updated, config: JSON.parse(updated.config_json) }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete layout
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM layouts WHERE id = ?', [id]);
    res.json({ message: 'Layout removido com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
