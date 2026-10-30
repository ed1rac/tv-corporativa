import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { fetchRssFeed } from '../services/rss.js';

const router = Router();

// Weather proxy (Open-Meteo)
router.get('/weather', async (req: Request, res: Response): Promise<void> => {
  try {
    const cityRow = await db.get("SELECT value FROM system_settings WHERE key = 'weather_city'");
    const latRow = await db.get("SELECT value FROM system_settings WHERE key = 'weather_latitude'");
    const lonRow = await db.get("SELECT value FROM system_settings WHERE key = 'weather_longitude'");

    const city = (req.query.city as string) || cityRow?.value || 'São Paulo';
    const lat = (req.query.lat as string) || latRow?.value || '-23.5505';
    const lon = (req.query.lon as string) || lonRow?.value || '-46.6333';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        throw new Error(`Open-Meteo responded with status ${response.status}`);
      }
      const data: any = await response.json();
      const current = data.current || {};

      // Map WMO weather codes to text and icon
      const code = current.weather_code ?? 0;
      let condition = 'Céu Limpo';
      let icon = '☀️';

      if (code === 0) { condition = 'Céu Limpo'; icon = '☀️'; }
      else if (code >= 1 && code <= 3) { condition = 'Parcialmente Nublado'; icon = '⛅'; }
      else if (code >= 45 && code <= 48) { condition = 'Nevoeiro'; icon = '🌫️'; }
      else if (code >= 51 && code <= 67) { condition = 'Chuva Leve'; icon = '🌧️'; }
      else if (code >= 71 && code <= 77) { condition = 'Frio Intenso'; icon = '❄️'; }
      else if (code >= 80 && code <= 82) { condition = 'Pancadas de Chuva'; icon = '🌦️'; }
      else if (code >= 95 && code <= 99) { condition = 'Tempestade'; icon = '⛈️'; }

      res.json({
        city,
        temperature: Math.round(current.temperature_2m ?? 24),
        apparent_temperature: Math.round(current.apparent_temperature ?? 25),
        humidity: current.relative_humidity_2m ?? 60,
        wind_speed: current.wind_speed_10m ?? 10,
        condition,
        icon
      });
    } catch (apiErr: any) {
      console.warn('[Weather] Open-Meteo API unavailable, serving fallback data:', apiErr.message);
      // Fallback
      res.json({
        city,
        temperature: 24,
        apparent_temperature: 25,
        humidity: 65,
        wind_speed: 12,
        condition: 'Parcialmente Nublado',
        icon: '⛅'
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RSS Feed proxy
router.get('/rss', async (req: Request, res: Response): Promise<void> => {
  try {
    const feedRow = await db.get("SELECT value FROM system_settings WHERE key = 'rss_feed_url'");
    const feedUrl = (req.query.url as string) || feedRow?.value || 'https://g1.globo.com/rss/g1/';

    const items = await fetchRssFeed(feedUrl);
    res.json({ feedUrl, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
