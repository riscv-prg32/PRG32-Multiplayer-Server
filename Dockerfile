FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
LABEL org.opencontainers.image.title="PRG32 Multiplayer Server" \
      org.opencontainers.image.description="WebSocket multiplayer relay for PRG32 consoles" \
      org.opencontainers.image.source="https://github.com/riscv-prg32/PRG32-Multiplayer-Server" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081 DATA_DIR=/data
WORKDIR /app
RUN addgroup -S prg32 && adduser -S -G prg32 prg32 && mkdir /data && chown prg32:prg32 /data
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json LICENSE ./
COPY src ./src
COPY public ./public
USER prg32
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8081/healthz || exit 1
STOPSIGNAL SIGTERM
CMD ["node", "src/server.js"]
