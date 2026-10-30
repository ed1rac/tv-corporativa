import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

let dbInstance: sqlite3.Database | null = null;

export function getDatabase(customPath?: string): sqlite3.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbFile = customPath || config.dbPath;
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = sqlite3.verbose();
  dbInstance = new sqlite.Database(dbFile, (err) => {
    if (err) {
      console.error(`[Database] Error opening database at ${dbFile}:`, err.message);
    } else {
      console.log(`[Database] Connected to SQLite database at ${dbFile}`);
    }
  });

  // Enable WAL mode & foreign keys
  dbInstance.serialize(() => {
    dbInstance!.run('PRAGMA journal_mode = WAL;');
    dbInstance!.run('PRAGMA foreign_keys = ON;');
    dbInstance!.run('PRAGMA busy_timeout = 5000;');
  });

  return dbInstance;
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    dbInstance.close((err) => {
      if (err) reject(err);
      else {
        dbInstance = null;
        resolve();
      }
    });
  });
}

// Promise helper functions
export const db = {
  get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const database = getDatabase();
    return new Promise((resolve, reject) => {
      database.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  },

  all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const database = getDatabase();
    return new Promise((resolve, reject) => {
      database.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as T[]);
      });
    });
  },

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const database = getDatabase();
    return new Promise((resolve, reject) => {
      database.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  exec(sql: string): Promise<void> {
    const database = getDatabase();
    return new Promise((resolve, reject) => {
      database.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
};
