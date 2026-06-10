# --- Build Stage ---
FROM node:20-alpine AS build

WORKDIR /app

# Puppeteer's bundled Chromium is glibc-based and won't run on Alpine (musl). Skip the
# download here and at runtime; we use the system Chromium installed in the prod stage.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the production assets
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine

WORKDIR /app

# Chromium + fonts for server-side mermaid rendering via Puppeteer.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Point Puppeteer at the system Chromium and don't download its own copy.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install production dependencies only. server.cjs is bundled with --packages=external,
# so express/googleapis/vite/puppeteer must be present in node_modules at runtime.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built frontend (dist/) and the bundled Express server (dist/server.cjs)
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

# Cloud Run injects PORT (defaults to 8080) and routes to it
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
