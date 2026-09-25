import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const categories = ['Flooring','Patios','Outdoor Kitchens','Concrete','Remodeling','Handyman','MEP','Other'];
export const defaults = {phone:'(832) 743-5009',email:'hello@buildex.example.com',hours:'Mon–Fri, 8 am–6 pm · Sat, 9 am–2 pm'};
export function openStore(directory) {
  mkdirSync(directory, {recursive:true});
  mkdirSync(path.join(directory,'uploads'), {recursive:true});
  const db = new DatabaseSync(path.join(directory,'buildex.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 2) throw new Error('This database requires a newer version of Buildex.');
  if (version === 0) db.exec(`BEGIN;
    CREATE TABLE admins (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE inquiries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, service TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, location TEXT NOT NULL, photos TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE photos (key TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, admin_id INTEGER NOT NULL REFERENCES admins(id), project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, created_at INTEGER NOT NULL);
    CREATE INDEX idx_inquiries_created ON inquiries(created_at DESC);
    CREATE INDEX idx_projects_updated ON projects(updated_at DESC);
    PRAGMA user_version=1;
    COMMIT;`);
  if(version<2)db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'published'; ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0; PRAGMA user_version=2;");
  return db;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [,salt,hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash,'hex');
  const actual = await scrypt(password,salt,64);
  return expected.length === actual.length && timingSafeEqual(expected,actual);
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function setAdmin(db,email,password) {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length>200) throw new Error('Enter a valid email address.');
  if (typeof password!=='string' || password.length<14 || password.length>256) throw new Error('Use a password or passphrase of 14–256 characters.');
  const hash = await hashPassword(password);
  db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash').run(email,hash);
  const admin = db.prepare('SELECT id FROM admins WHERE email=?').get(email);
  db.prepare('DELETE FROM sessions WHERE admin_id=?').run(admin.id);
}
