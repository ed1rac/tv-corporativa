import { db } from './connection.js';

async function safeAddColumn(table: string, columnDef: string): Promise<void> {
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (e) {
    // Column already exists, ignore
  }
}

export async function runMigrations(): Promise<void> {
  console.log('[Database] Running migrations...');

  await db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Layouts table
    CREATE TABLE IF NOT EXISTS layouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL DEFAULT '16:9',
      description TEXT,
      config_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Displays (Screens) table
    CREATE TABLE IF NOT EXISTS displays (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      layout_id TEXT,
      playlist_id TEXT,
      orientation TEXT NOT NULL DEFAULT 'landscape',
      resolution TEXT DEFAULT '1920x1080',
      location TEXT,
      show_header INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'offline',
      last_ping DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (layout_id) REFERENCES layouts(id) ON DELETE SET NULL
    );

    -- Playlists table
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Media Library table
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      media_type TEXT NOT NULL, -- 'image' or 'video'
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      duration_seconds INTEGER DEFAULT 10,
      storage_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Playlist Items table
    CREATE TABLE IF NOT EXISTS playlist_items (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      media_id TEXT,
      widget_type TEXT, -- NULL if media, or 'CLOCK', 'WEATHER', 'RSS_TICKER', 'QUEUE_CALL'
      widget_config_json TEXT,
      order_num INTEGER NOT NULL DEFAULT 1,
      duration_seconds INTEGER NOT NULL DEFAULT 10,
      is_active INTEGER NOT NULL DEFAULT 1,
      start_date DATETIME,
      end_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
    );

    -- Queue Calls table (Clinic tickets & notifications)
    CREATE TABLE IF NOT EXISTS queue_calls (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL,
      location TEXT NOT NULL, -- e.g. "Consultório 03" or "Guichê 01"
      service_type TEXT NOT NULL DEFAULT 'Normal', -- 'Normal', 'Prioritário', etc.
      service_name TEXT DEFAULT 'Atendimento Geral', -- Qual o atendimento (Ex: Clínica Geral, Exames, Recepção)
      patient_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active' -- 'waiting', 'active', 'completed'
    );

    -- Service Desks (Guichês e Consultórios)
    CREATE TABLE IF NOT EXISTS service_desks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Consultório',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Types (Tipos de Atendimento para geração de senhas)
    CREATE TABLE IF NOT EXISTS service_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT 'A',
      is_priority INTEGER NOT NULL DEFAULT 0,
      current_seq INTEGER NOT NULL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- System Settings table
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe non-destructive schema upgrades for existing databases
  await safeAddColumn('displays', 'playlist_id TEXT');
  await safeAddColumn('displays', 'show_header INTEGER NOT NULL DEFAULT 1');
  await safeAddColumn('queue_calls', "service_name TEXT DEFAULT 'Atendimento Geral'");
  await safeAddColumn('queue_calls', 'created_at DATETIME');

  console.log('[Database] Migrations executed successfully.');
}
