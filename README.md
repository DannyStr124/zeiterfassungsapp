# Zeiterfassungsapp

Private PWA zur persönlichen Arbeitszeiterfassung.

## Tech Stack
- Vite + Vanilla JS (PWA, Service Worker)
- Express Backend (Auth via Session + bcrypt)
- session-file-store (persistente Sessions)

## Development
```bash
npm install
npm run dev
```
Frontend: http://localhost:5173  API: http://localhost:3000

## Build / Produktion
```bash
npm run build
NODE_ENV=production node server/server.js
```
Liefert `dist/` + API über denselben Express-Port.

## Environment (.env)
```
ADMIN_USER="Daniel Streuter"
ADMIN_PASSWORD_HASH="<bcrypt-hash>"
SESSION_SECRET="<lange-zufallszeichenkette>"
PORT=3000
DATA_PATH=server/data/entries.json
```
Beispiel Hash erzeugen:
```bash
node -e "import('bcrypt').then(b=>b.hash('MeinSicheresPasswort',12).then(h=>console.log(h)))"
```

## Railway Deployment (Kurz)
1. Repo zu GitHub (privat möglich)
2. Railway: New Project → GitHub Repo
3. Variables setzen (s. oben) + Volumes:
   - /app/server/data
   - /app/sessions
4. Build: `npm ci && npm run build`
5. Start: `node server/server.js`
6. URL öffnen, Login testen.

## CSV Export
Export enthält Minuten (gerundet) und Nettozeit.

## Persistente Speicherung (JSON)
DEV: `DATA_PATH=server/data/entries.json` (Standard wenn NODE_ENV!=production)
PROD (Railway): `DATA_PATH=/data/entries.json` (Volume unter /data mounten)
Fehlt Datei: wird automatisch mit `[]` angelegt. Schreibvorgänge atomar (Temp-Datei + rename) zur Korruptionsvermeidung. Beispiel-Template: `server/data/entries.sample.json`.
Setze in Railway Variables: `DATA_PATH=/data/entries.json` und füge ein Volume mit Mount Path `/data` hinzu.

// Railway Schritte (nur hier dokumentiert, nicht im Code ausführen):
// Service → Settings → Volumes → Add Volume (z.B. 1GB) Mount Path: /data
// Service → Variables → DATA_PATH=/data/entries.json
// Deploy; Daten bleiben bestehen.

## Lizenz
Privates Projekt.
