import request from 'supertest';
import { app } from './setup.js';

describe('Clinic Queue & Ticket Calling API', () => {
  it('should list recent tickets', async () => {
    const res = await request(app).get('/api/queue/recent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.calls)).toBe(true);
    expect(res.body.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('should call a new ticket for a clinic consultation', async () => {
    const res = await request(app)
      .post('/api/queue/call')
      .send({
        ticket_number: 'A-205',
        location: 'Consultório 04 - Pediatria',
        service_type: 'Normal',
        patient_name: 'Lucas Silva'
      });

    expect(res.status).toBe(201);
    expect(res.body.call.ticket_number).toBe('A-205');
    expect(res.body.call.location).toBe('Consultório 04 - Pediatria');
  });

  it('should reject call without ticket number or location', async () => {
    const res = await request(app)
      .post('/api/queue/call')
      .send({ location: 'Consultório 01' });

    expect(res.status).toBe(400);
  });
});
