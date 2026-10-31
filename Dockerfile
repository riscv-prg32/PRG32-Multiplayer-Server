FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081 DATA_DIR=/data
WORKDIR /app
RUN addgroup -S prg32 && adduser -S -G prg32 prg32 && mkdir /data && chown prg32:prg32 /data
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER prg32
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://127.0.0.1:8081/healthz || exit 1
CMD ["node", "src/server.js"]
