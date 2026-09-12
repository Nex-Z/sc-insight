import 'dotenv/config';
import pg from 'pg';
import {recordingSchema} from './recording-schema.js';
const database = process.env.PGDATABASE;
if (!/^[a-z_][a-z0-9_]*$/.test(database || '')) throw new Error('Invalid database name');
const admin = new pg.Client({database:'postgres',connectionTimeoutMillis:5000});
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();
const db = new pg.Client({connectionTimeoutMillis:5000});
await db.connect();
try {
 await db.query('BEGIN');
 await db.query(`CREATE TABLE IF NOT EXISTS models (
 id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, country TEXT NOT NULL, language TEXT NOT NULL,
 viewers INTEGER NOT NULL DEFAULT 0, growth INTEGER NOT NULL DEFAULT 0, online BOOLEAN DEFAULT true,
 favorite BOOLEAN DEFAULT false, monitored BOOLEAN DEFAULT false, note TEXT DEFAULT '', color TEXT NOT NULL,
 created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS monitor_rules (id SERIAL PRIMARY KEY,name TEXT NOT NULL,condition TEXT NOT NULL,enabled BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS recordings (id SERIAL PRIMARY KEY,model_id INTEGER REFERENCES models(id),filename TEXT NOT NULL,status TEXT NOT NULL DEFAULT '待接入',duration TEXT DEFAULT '—',size TEXT DEFAULT '—',created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY,model_id INTEGER REFERENCES models(id),title TEXT NOT NULL,detail TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS model_snapshots (id BIGSERIAL PRIMARY KEY,model_id INTEGER REFERENCES models(id),viewers INTEGER NOT NULL,online BOOLEAN NOT NULL,sampled_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS snapshots_model_time ON model_snapshots(model_id,sampled_at);
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value JSONB NOT NULL);`);
 await db.query(`ALTER TABLE models ADD COLUMN IF NOT EXISTS source_id TEXT UNIQUE;
 ALTER TABLE models ADD COLUMN IF NOT EXISTS cover_url TEXT;
 ALTER TABLE models ADD COLUMN IF NOT EXISTS avatar_url TEXT;
 ALTER TABLE models ADD COLUMN IF NOT EXISTS room_status TEXT DEFAULT 'unknown';
 ALTER TABLE models ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
 ALTER TABLE models ALTER COLUMN growth DROP DEFAULT;
 ALTER TABLE models ALTER COLUMN growth DROP NOT NULL;
 CREATE TABLE IF NOT EXISTS collection_runs (id BIGSERIAL PRIMARY KEY,started_at TIMESTAMPTZ DEFAULT now(),finished_at TIMESTAMPTZ,count INTEGER DEFAULT 0,status TEXT NOT NULL,error TEXT);`);
 await recordingSchema(db);
 await db.query('COMMIT');
 console.log(`Database ${database} ready; schema installed idempotently.`);
} catch(e) { await db.query('ROLLBACK'); throw e; } finally { await db.end(); }


