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

## Lizenz
Privates Projekt.
