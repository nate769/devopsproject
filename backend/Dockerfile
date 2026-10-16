# ---------- Stage 1: install production dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------- Stage 2: minimal runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

# Pull in Alpine security fixes newer than the base image (Trivy gate), then remove
# npm/npx/corepack/yarn: not needed at runtime, and their bundled deps widen the attack surface.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json knexfile.js ./
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node seeds ./seeds
COPY --chown=node:node src ./src

# The official node image ships an unprivileged "node" user (uid 1000).
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

# server.js runs Knex migrations (and idempotent seed) before listening.
CMD ["node", "src/server.js"]
