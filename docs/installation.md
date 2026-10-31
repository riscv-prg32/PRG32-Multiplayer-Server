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

## Docker and Docker Compose

```bash
export DEVICE_ID_SECRET="$(openssl rand -base64 32)"
export ADMIN_TOKEN="$(openssl rand -base64 32)"
docker compose up --build -d
curl http://localhost:8081/healthz
```

The image runs as an unprivileged user with a read-only root filesystem. The
named `/data` volume stores bounded telemetry and the pseudonymous device
registry; live rooms and game snapshots remain in memory. Read the complete
[Docker and Docker Compose guide](docker.md) before public deployment, backup,
upgrade, or erasure.
