import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'tvcorporativa_secret_jwt_key_2026_super_secure',
  jwtExpiresIn: '7d',
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'tv_corporativa.db'),
  mediaPath: process.env.MEDIA_PATH || path.resolve(process.cwd(), 'media'),
  defaultCity: process.env.DEFAULT_CITY || 'São Paulo',
  defaultRssUrl: process.env.DEFAULT_RSS_URL || 'https://g1.globo.com/rss/g1/',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo',
};
