# ---------- Stage 1: build the React app with Node ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: serve static files with unprivileged nginx ----------
# nginx-unprivileged runs as uid 101 and listens on 8080 (no root needed for port < 1024).
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Base images lag behind Alpine security fixes; pull them in at build time (Trivy gate).
USER root
RUN apk upgrade --no-cache
ENV BACKEND_URL=http://backend:4000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
