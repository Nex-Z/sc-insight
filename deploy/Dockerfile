FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 HOST=0.0.0.0 PORT=3010
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY dist ./dist
RUN mkdir -p /app/storage/recordings && chown -R node:node /app/storage
USER node
EXPOSE 3010
CMD ["sh","-c","node server/init.mjs && exec node --use-env-proxy server/index.mjs"]
