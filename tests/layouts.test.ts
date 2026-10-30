import request from 'supertest';
import { app } from './setup.js';

describe('Layouts & Multi-Zone API', () => {
  let adminToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'tvcorporativa' });
    adminToken = res.body.token;
  });

  it('should list all pre-configured multi-zone layouts', async () => {
    const res = await request(app)
      .get('/api/layouts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.layouts.length).toBeGreaterThanOrEqual(5);

    const layoutNames = res.body.layouts.map((l: any) => l.name);
    expect(layoutNames).toContain('Tela Cheia (16:9 / 9:16)');
    expect(layoutNames).toContain('Notícias & TV Corporativa');
    expect(layoutNames).toContain('Consultório & Chamada de Senhas');
    expect(layoutNames).toContain('Elevador / Totem Vertical (9:16)');
    expect(layoutNames).toContain('Grid 4 Zonas (2x2)');
  });

  it('should verify zone structure for corporate news layout', async () => {
    const res = await request(app)
      .get('/api/layouts/layout-corporate-news')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const config = res.body.layout.config;
    expect(config.zones).toBeDefined();

    const zoneTypes = config.zones.map((z: any) => z.type);
    expect(zoneTypes).toContain('PLAYLIST');
    expect(zoneTypes).toContain('COMPOSITE');
    expect(zoneTypes).toContain('RSS_TICKER');
  });
});
