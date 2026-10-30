import http from 'http';
import app from './app.js';
import { config } from './config/index.js';
import { runMigrations } from './database/migrations.js';
import { runSeed } from './database/seed.js';
import { setupWebSocket } from './services/websocket.js';

async function bootstrap() {
  try {
    console.log('==================================================');
    console.log('  🚀 Iniciando TV Corporativa & Sinalização Digital');
    console.log('==================================================');

    // Run database migrations and seed
    await runMigrations();
    await runSeed();

    // Create HTTP Server
    const server = http.createServer(app);

    // Setup WebSocket Hub
    setupWebSocket(server);

    // Start Listening
    server.listen(config.port, () => {
      console.log(`[Servidor] Rodando na porta ${config.port}`);
      console.log(`[Painel Admin] Acesse http://localhost:${config.port}/admin`);
      console.log(`[Player TV]   Acesse http://localhost:${config.port}/player?code=TV-01`);
      console.log(`[API Health]  Acesse http://localhost:${config.port}/api/health`);
    });

    const shutdown = () => {
      console.log('\n[Servidor] Encerrando graciosamente...');
      server.close(() => {
        console.log('[Servidor] Encerrado.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[Servidor Erro Crítico]', err);
    process.exit(1);
  }
}

bootstrap();
