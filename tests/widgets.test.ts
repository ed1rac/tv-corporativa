import request from 'supertest';
import { app } from './setup.js';

describe('Widgets API (Weather & RSS)', () => {
  it('should return weather data for default or custom city', async () => {
    const res = await request(app).get('/api/widgets/weather?city=São Paulo');

    expect(res.status).toBe(200);
    expect(res.body.city).toBe('São Paulo');
    expect(res.body.temperature).toBeDefined();
    expect(typeof res.body.temperature).toBe('number');
    expect(res.body.condition).toBeDefined();
    expect(res.body.icon).toBeDefined();
  });

  it('should return parsed RSS news items or fallback', async () => {
    const res = await request(app).get('/api/widgets/rss');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].title).toBeDefined();
  });
});
