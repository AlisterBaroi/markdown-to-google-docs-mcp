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

# VITE_* values are inlined into the client bundle at BUILD time, so they must be passed
# as --build-arg here (NOT as Cloud Run runtime env vars, which never reach the built client).
# Without these, Firebase config is empty and sign-in fails with "apiKey is missing".
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Build the production assets (client bundle bakes in the VITE_* values above)
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
