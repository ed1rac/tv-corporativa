import request from 'supertest';
import { app } from './setup.js';

describe('Displays API', () => {
  let adminToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'tvcorporativa' });
    adminToken = res.body.token;
  });

  it('should list all pre-seeded displays', async () => {
    const res = await request(app)
      .get('/api/displays')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.displays)).toBe(true);
    expect(res.body.displays.length).toBeGreaterThanOrEqual(3);
  });

  it('should fetch public display config by screen code (TV-01)', async () => {
    const res = await request(app).get('/api/displays/code/TV-01');

    expect(res.status).toBe(200);
    expect(res.body.display.code).toBe('TV-01');
    expect(res.body.layout).toBeDefined();
    expect(res.body.layout.config.zones).toBeDefined();
    expect(res.body.playlist).toBeDefined();
    expect(res.body.playlist.items.length).toBeGreaterThan(0);
  });

  it('should return 404 for non-existent display code', async () => {
    const res = await request(app).get('/api/displays/code/TV-INVALID-99');
    expect(res.status).toBe(404);
  });

  it('should create a new display and delete it', async () => {
    const createRes = await request(app)
      .post('/api/displays')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tela Sala de Treinamento',
        code: 'TV-TEST-99',
        orientation: 'landscape',
        location: 'Prédio B'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.display.code).toBe('TV-TEST-99');

    const displayId = createRes.body.display.id;

    // Delete
    const delRes = await request(app)
      .delete(`/api/displays/${displayId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);
  });
});
