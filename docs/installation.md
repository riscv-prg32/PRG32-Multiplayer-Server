# Installation

## Node.js

Install an active Node.js 22 LTS release and npm. On Linux, macOS, or Windows:

```bash
git clone https://github.com/riscv-prg32/PRG32-Multiplayer-Server.git
cd PRG32-Multiplayer-Server
npm ci
cp .env.example .env
npm start
```

Generate `DEVICE_ID_SECRET` with a cryptographically secure password manager
or `openssl rand -base64 32`. Do not commit `.env`.

## Container

```bash
export DEVICE_ID_SECRET="$(openssl rand -base64 32)"
docker compose up --build -d
curl http://localhost:8081/healthz
```

The image runs as an unprivileged user and stores no game state.
