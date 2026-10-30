import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcastScreenReload } from '../services/websocket.js';

const router = Router();

// List all playlists
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const playlists = await db.all(`
      SELECT p.*, COUNT(pi.id) as item_count
      FROM playlists p
      LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);
    res.json({ playlists });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get playlist by ID with full items
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const playlist = await db.get('SELECT * FROM playlists WHERE id = ?', [id]);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist não encontrada.' });
      return;
    }

    const items = await db.all(`
      SELECT pi.*, m.filename, m.original_name, m.media_type, m.duration_seconds as media_duration, m.file_size
      FROM playlist_items pi
      LEFT JOIN media m ON pi.media_id = m.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.order_num ASC
    `, [id]);

    res.json({
      playlist: {
        ...playlist,
        items
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create playlist
router.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'O nome da playlist é obrigatório.' });
      return;
    }

    const id = randomUUID();
    await db.run(
      'INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)',
      [id, name, description || '']
    );

    const created = await db.get('SELECT * FROM playlists WHERE id = ?', [id]);
    res.status(201).json({ message: 'Playlist criada com sucesso.', playlist: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add item to playlist
router.post('/:id/items', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { media_id, widget_type, widget_config, duration_seconds, is_active } = req.body;

    const playlist = await db.get('SELECT id FROM playlists WHERE id = ?', [id]);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist não encontrada.' });
      return;
    }

    // Get max order
    const maxOrderRow = await db.get(
      'SELECT MAX(order_num) as max_order FROM playlist_items WHERE playlist_id = ?',
      [id]
    );
    const nextOrder = (maxOrderRow?.max_order || 0) + 1;

    const itemId = randomUUID();
    await db.run(`
      INSERT INTO playlist_items (
        id, playlist_id, media_id, widget_type, widget_config_json,
        order_num, duration_seconds, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      itemId,
      id,
      media_id || null,
      widget_type || null,
      widget_config ? JSON.stringify(widget_config) : null,
      nextOrder,
      duration_seconds ? parseInt(duration_seconds, 10) : 10,
      is_active !== undefined ? (is_active ? 1 : 0) : 1
    ]);

    broadcastScreenReload();

    const createdItem = await db.get(`
      SELECT pi.*, m.filename, m.original_name, m.media_type
      FROM playlist_items pi
      LEFT JOIN media m ON pi.media_id = m.id
      WHERE pi.id = ?
    `, [itemId]);

    res.status(201).json({ message: 'Item adicionado à playlist com sucesso.', item: createdItem });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder playlist items
router.post('/:id/reorder', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { itemIds } = req.body; // array of item IDs in desired order

    if (!Array.isArray(itemIds)) {
      res.status(400).json({ error: 'Lista de IDs de itens inválida.' });
      return;
    }

    for (let i = 0; i < itemIds.length; i++) {
      await db.run(
        'UPDATE playlist_items SET order_num = ? WHERE id = ? AND playlist_id = ?',
        [i + 1, itemIds[i], id]
      );
    }

    broadcastScreenReload();
    res.json({ message: 'Itens reordenados com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle or update playlist item
router.put('/items/:itemId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const { duration_seconds, is_active, order_num } = req.body;

    const item = await db.get('SELECT * FROM playlist_items WHERE id = ?', [itemId]);
    if (!item) {
      res.status(404).json({ error: 'Item não encontrado.' });
      return;
    }

    const newDuration = duration_seconds !== undefined ? parseInt(duration_seconds, 10) : item.duration_seconds;
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : item.is_active;
    const newOrder = order_num !== undefined ? parseInt(order_num, 10) : item.order_num;

    await db.run(`
      UPDATE playlist_items
      SET duration_seconds = ?, is_active = ?, order_num = ?
      WHERE id = ?
    `, [newDuration, newActive, newOrder, itemId]);

    broadcastScreenReload();
    res.json({ message: 'Item atualizado com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete playlist item
router.delete('/items/:itemId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    await db.run('DELETE FROM playlist_items WHERE id = ?', [itemId]);
    broadcastScreenReload();
    res.json({ message: 'Item removido da playlist com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete playlist
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM playlists WHERE id = ?', [id]);
    res.json({ message: 'Playlist removida com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
