# ShopO-AI — single container: Express API + built React app
# Build:  docker build -t shopo-ai .
# Run:    docker compose up    (see docker-compose.yml)

# ---------- 1. Build the React client ----------
FROM node:20-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- 2. Server runtime ----------
FROM node:20-bookworm-slim
# Chromium for Puppeteer-based scrapers (Amazon/Daraz fallbacks)
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=5000
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/build /app/client/build
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
