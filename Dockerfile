# --- Build Stage ---
FROM node:20-alpine AS build

WORKDIR /app

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

# Install production dependencies only. server.cjs is bundled with --packages=external,
# so express/googleapis/vite must be present in node_modules at runtime.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built frontend (dist/) and the bundled Express server (dist/server.cjs)
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

# Cloud Run injects PORT (defaults to 8080) and routes to it
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
