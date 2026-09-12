FROM node:24-alpine
RUN apk add --no-cache ffmpeg ca-certificates
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 HOST=0.0.0.0 PORT=3010
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node dist ./dist
RUN mkdir -p /app/storage/recordings && chown -R node:node /app/storage
USER node
EXPOSE 3010
CMD ["sh","-c","node server/init.mjs && exec node --use-env-proxy server/index.mjs"]

