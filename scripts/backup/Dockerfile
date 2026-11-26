FROM node:24-alpine AS dependencies
WORKDIR /app
COPY scripts/backup/package.json scripts/backup/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
RUN apk add --no-cache postgresql18-client ca-certificates \
    && addgroup -g 10001 -S rova-backup \
    && adduser -u 10001 -S -G rova-backup rova-backup
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=rova-backup:rova-backup scripts/backup/package.json ./package.json
COPY --chown=rova-backup:rova-backup scripts/backup/backup.mjs ./scripts/backup/backup.mjs
COPY --chown=rova-backup:rova-backup scripts/backup/restore.mjs ./scripts/backup/restore.mjs
COPY --chown=rova-backup:rova-backup scripts/backup/lib.mjs ./scripts/backup/lib.mjs
ENV NODE_ENV=production
USER rova-backup
ENTRYPOINT ["node", "scripts/backup/backup.mjs"]
