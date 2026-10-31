import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../database/connection.js';
import { broadcast, broadcastQueueCall } from '../services/websocket.js';

const router = Router();

// List recent queue calls, waiting tickets, desks (guichês/consultórios) and service types
router.get('/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    const calls = await db.all(`
      SELECT * FROM queue_calls
      WHERE status = 'active'
      ORDER BY called_at DESC
      LIMIT 12
    `);

    const waiting = await db.all(`
      SELECT * FROM queue_calls
      WHERE status = 'waiting'
      ORDER BY CASE WHEN service_type = 'Prioritário' THEN 0 ELSE 1 END ASC, called_at ASC
    `);

    const desks = await db.all(`
      SELECT * FROM service_desks
      WHERE is_active = 1
      ORDER BY category ASC, name ASC
    `);

    const services = await db.all(`
      SELECT * FROM service_types
      ORDER BY is_priority DESC, name ASC
    `);

    res.json({ calls, waiting, desks, services });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate a new ticket into the waiting queue (Totem / Recepção)
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id, patient_name, preferred_location } = req.body;

    let service = null;
    if (service_id) {
      service = await db.get('SELECT * FROM service_types WHERE id = ?', [service_id]);
    }
    if (!service) {
      service = await db.get('SELECT * FROM service_types LIMIT 1');
    }

    let ticketNumber = 'A-100';
    let serviceName = 'Atendimento Geral';
    let serviceType = 'Normal';

    if (service) {
      const nextSeq = (service.current_seq || 100) + 1;
      await db.run('UPDATE service_types SET current_seq = ? WHERE id = ?', [nextSeq, service.id]);
      const padded = String(nextSeq).padStart(3, '0');
      ticketNumber = `${service.prefix}-${padded}`;
      serviceName = service.name;
      serviceType = service.is_priority ? 'Prioritário' : 'Normal';
    } else {
      const rand = Math.floor(100 + Math.random() * 900);
      ticketNumber = `A-${rand}`;
    }

    const id = randomUUID();
    await db.run(`
      INSERT INTO queue_calls (id, ticket_number, location, service_type, service_name, patient_name, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'waiting', CURRENT_TIMESTAMP)
    `, [
      id,
      ticketNumber,
      preferred_location ? preferred_location.trim() : 'Aguardando Guichê/Consultório',
      serviceType,
      serviceName,
      patient_name ? patient_name.trim() : null
    ]);

    const ticket = await db.get('SELECT * FROM queue_calls WHERE id = ?', [id]);
    broadcast('queue:updated', { ticket });

    res.status(201).json({
      message: `Senha ${ticketNumber} gerada com sucesso!`,
      ticket
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Call ticket (by ticket_id from waiting queue, or call_next, or manual ticket_number)
router.post('/call', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticket_id, call_next, ticket_number, location, service_type, service_name, patient_name } = req.body;

    if (!location) {
      res.status(400).json({ error: 'Local / Guichê / Consultório é obrigatório.' });
      return;
    }

    // Mode 1: Call specific waiting ticket by ID or call next in waiting queue
    if (ticket_id || call_next) {
      let waitingTicket = null;
      if (ticket_id) {
        waitingTicket = await db.get('SELECT * FROM queue_calls WHERE id = ?', [ticket_id]);
      } else {
        waitingTicket = await db.get(`
          SELECT * FROM queue_calls
          WHERE status = 'waiting'
          ORDER BY CASE WHEN service_type = 'Prioritário' THEN 0 ELSE 1 END ASC, called_at ASC
          LIMIT 1
        `);
      }

      if (!waitingTicket) {
        res.status(404).json({ error: 'Nenhuma senha aguardando na fila de espera.' });
        return;
      }

      await db.run(`
        UPDATE queue_calls
        SET location = ?,
            service_name = COALESCE(?, service_name),
            patient_name = COALESCE(?, patient_name),
            status = 'active',
            called_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        location.trim(),
        service_name ? service_name.trim() : null,
        patient_name ? patient_name.trim() : null,
        waitingTicket.id
      ]);

      const called = await db.get('SELECT * FROM queue_calls WHERE id = ?', [waitingTicket.id]);
      broadcastQueueCall(called);

      res.status(201).json({
        message: `Senha ${called.ticket_number} chamada para ${called.location}!`,
        call: called
      });
      return;
    }

    // Mode 2: Direct / Manual Call
    if (!ticket_number) {
      res.status(400).json({ error: 'Número da senha e local/consultório são obrigatórios.' });
      return;
    }

    const id = randomUUID();
    await db.run(`
      INSERT INTO queue_calls (id, ticket_number, location, service_type, service_name, patient_name, status, called_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `, [
      id,
      ticket_number.trim().toUpperCase(),
      location.trim(),
      service_type || 'Normal',
      service_name ? service_name.trim() : 'Atendimento Geral',
      patient_name ? patient_name.trim() : null
    ]);

    const created = await db.get('SELECT * FROM queue_calls WHERE id = ?', [id]);
    broadcastQueueCall(created);

    res.status(201).json({
      message: 'Senha chamada com sucesso.',
      call: created
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recall an already active ticket (repeat sound and announcement on TV)
router.post('/recall/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM queue_calls WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Senha não encontrada.' });
      return;
    }

    await db.run('UPDATE queue_calls SET called_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    const updated = await db.get('SELECT * FROM queue_calls WHERE id = ?', [id]);
    broadcastQueueCall(updated);

    res.json({ message: `Senha ${updated.ticket_number} rechamada no painel!`, call: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new Service Desk (Guichê / Consultório)
router.post('/desks', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Nome do guichê ou consultório é obrigatório.' });
      return;
    }
    const id = randomUUID();
    await db.run(
      'INSERT INTO service_desks (id, name, category, is_active) VALUES (?, ?, ?, 1)',
      [id, name.trim(), category || 'Consultório']
    );
    const desk = await db.get('SELECT * FROM service_desks WHERE id = ?', [id]);
    res.status(201).json({ message: 'Guichê/Consultório cadastrado.', desk });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a Service Desk
router.delete('/desks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await db.run('DELETE FROM service_desks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Guichê/Consultório removido.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new Service Type (Tipo de Atendimento / Fila)
router.post('/services', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, prefix, is_priority } = req.body;
    if (!name || !prefix) {
      res.status(400).json({ error: 'Nome do atendimento e prefixo da senha são obrigatórios.' });
      return;
    }
    const id = randomUUID();
    await db.run(
      'INSERT INTO service_types (id, name, prefix, is_priority, current_seq) VALUES (?, ?, ?, ?, 100)',
      [id, name.trim(), prefix.trim().toUpperCase(), is_priority ? 1 : 0]
    );
    const service = await db.get('SELECT * FROM service_types WHERE id = ?', [id]);
    res.status(201).json({ message: 'Tipo de atendimento cadastrado.', service });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a Service Type
router.delete('/services/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await db.run('DELETE FROM service_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'Tipo de atendimento removido.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear active queue
router.post('/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    await db.run('DELETE FROM queue_calls');
    broadcast('queue:updated', { cleared: true });
    res.json({ message: 'Histórico e fila de senhas limpos com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
