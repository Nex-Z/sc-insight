FROM mwader/static-ffmpeg@sha256:17ec9de35b3adb3b8a68d5ca2d6d49d18c56682c8d06c8e0613dc09dadfc0f83 AS media
FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81
COPY --from=media /ffmpeg /ffprobe /usr/local/bin/
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

