import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../database/connection.js';
import { broadcastQueueCall } from '../services/websocket.js';

const router = Router();

// List recent queue calls (active)
router.get('/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    const calls = await db.all(`
      SELECT * FROM queue_calls
      ORDER BY called_at DESC
      LIMIT 10
    `);
    res.json({ calls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Call new ticket (Doctor / Receptionist action)
router.post('/call', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticket_number, location, service_type, patient_name } = req.body;

    if (!ticket_number || !location) {
      res.status(400).json({ error: 'Número da senha e local/consultório são obrigatórios.' });
      return;
    }

    const id = randomUUID();
    await db.run(`
      INSERT INTO queue_calls (id, ticket_number, location, service_type, patient_name, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [
      id,
      ticket_number.trim().toUpperCase(),
      location.trim(),
      service_type || 'Normal',
      patient_name ? patient_name.trim() : null
    ]);

    const created = await db.get('SELECT * FROM queue_calls WHERE id = ?', [id]);

    // Broadcast instant ticket call via WebSocket to all displays
    broadcastQueueCall(created);

    res.status(201).json({
      message: 'Senha chamada com sucesso.',
      call: created
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear active queue
router.post('/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    await db.run('DELETE FROM queue_calls');
    res.json({ message: 'Histórico de senhas limpo com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
