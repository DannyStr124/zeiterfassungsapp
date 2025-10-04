import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_LOCAL = 'server/data/entries.json';
const DEFAULT_PROD = '/data/entries.json';

const DATA_PATH = (process.env.DATA_PATH?.trim() || (process.env.NODE_ENV === 'production' ? DEFAULT_PROD : DEFAULT_LOCAL));

const ensureFile = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf8');
};

const writeAtomic = (filePath, data) => {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(data, null, 2) + os.EOL;
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, filePath);
};

export const Storage = {
  path: DATA_PATH,
  init() {
    ensureFile(DATA_PATH);
    try { JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '[]'); }
    catch { writeAtomic(DATA_PATH, []); }
  },
  read() {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      const backup = `${DATA_PATH}.bad-${Date.now()}.json`;
      fs.writeFileSync(backup, raw, 'utf8');
      writeAtomic(DATA_PATH, []);
      return [];
    }
  },
  write(entries) {
    if (!Array.isArray(entries)) throw new Error('entries must be an array');
    writeAtomic(DATA_PATH, entries);
  },
  append(entry) {
    const list = this.read();
    list.push(entry);
    this.write(list);
  },
  replaceById(id, patch) {
    const list = this.read();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...patch };
    this.write(list);
    return true;
  },
  deleteById(id) {
    const list = this.read();
    const next = list.filter(e => e.id !== id);
    if (next.length === list.length) return false;
    this.write(next);
    return true;
  }
};

Storage.init();
