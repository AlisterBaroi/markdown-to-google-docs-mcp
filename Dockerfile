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
FROM nginx:stable-alpine

# Copy built static assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy our custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose Nginx default port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
