# Markdown to Docs 📝➡️📄

> Upload Markdown files and automatically convert them into elegantly styled, highly readable Google Docs inside your Google Drive.

---

## 🎨 Visual Identity & Styling

This application features a highly modular, interactive, and beautifully responsive design:
- **Clean Slate Interface**: Built using modern **Tailwind CSS** with elegant spacing, soft grays, and precise layout structures.
- **Dynamic Header**: Features an inline header spanning a vertical height of `60px` with a sleek, interactive border and high contrast.
- **Responsive Theme Mechanics**: Includes seamless dark and light mode transitions. In dark mode, interactive controls (such as the Sun icon) are styled using crisp white accents and high transparency backdrops.
- **Micro-interactions**: Enhanced profile dropdowns and user navigation menus, highlighted by soft custom transitions (such as light-blue hover backgrounds on sign-out blocks).

---

## ✨ Features

- **📂 Fluid Drag & Drop / Direct Selection**: Easily queue multiple `.md` files for conversion in a sleek drop zone, or browse locally.
- **📁 Google Drive Folder Browser**: Double-click folder rows, search specific subdirectories, and create fresh folders directly within the UI to choose the perfect generation target.
- **✍️ Presets & Typography Formatting**: Custom configurations for layout presets, titles, and section style presets automatically converted to Doc headings.
- **🔐 Secure Client Google Integration**: Authenticate seamlessly via Google OAuth with direct permission flows and real-time connectivity states.

---

## 🛠️ Architecture & Technical Stack

The application integrates with the following modern technologies and APIs:

- **Frontend Core**: React 19 + TypeScript, loaded with custom components.
- **Bundler & Dev Server**: Vite 6, configured to deliver minimal bundle sizes and fluid, lightning-fast reloads on port `3000`.
- **Parsing Engine**: Markdown syntax analysis driven by standard, highly compliant markdown parsers.
- **Google Integrations**:
  - **Google Documents API (v1)**: Leveraged for generating, formatting, and appending styled document sections sequentially.
  - **Google Drive API (v3)**: Leveraged to list directories, create folders, and move created target documents into specified nested locations.
- **Identity & Auth**: Firebase-supported secure client authentication to acquire OAuth access tokens natively with zero intermediate backend footprint.

---

## ⚙️ Development & Environment Setup

### 1. Variables Config (`.env`)
To enable full local operations, copy `.env.example` into a local `.env` file at the root:

```env
# Google Firebase Access Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

### 2. Startup Command Reference

Install dependencies and boot up your local dev server securely:

```bash
# Install dependencies
npm install

# Run the local application development server
npm run dev
```

The application runs directly at `http://localhost:3000` with hot-module reloads.

### 3. Build & Production Compile

To prepare a production-ready, minified build containing compiled TypeScript assets, use:

```bash
npm run build
```

This compiles static assets securely into the `/dist/` folder.

---

## 🚀 Running in Production

Since this is a client-side Single-Page Application (SPA), the output directory (`/dist/`) contains purely static files (`html`, `js`, `css`, vectors). To run the application in a production environment (VM, Cloud Run, VPS, or cloud storage buckets), choose one of the following setups:

### Mode A: Lightweight Node Server (Quickest for VMs & Cloud Run)
You can serve the static build using a lightweight node-based filesystem server like `serve`.

1. **Install globally or run over `npx`:**
   ```bash
   # Start serving on port 3000 (with single-page routing support)
   npx serve -s dist -l 3000
   ```
2. **Configure in `package.json`:**
   You can add a start script to easily run the server within standard application runners:
   ```json
   "scripts": {
     "start": "serve -s dist -l 3000"
   }
   ```
   *(Ensure you have installed the server as a dependency beforehand: `npm install serve`)*

### Mode B: Containerized with Docker & Nginx (Best practice for Cloud Run or Kubernetes)
To build a highly performant container image using Nginx to serve the assets with custom cache headers and fallback routing:

1. **Create a `Dockerfile` at the root folder:**
   ```dockerfile
   # --- Build Stage ---
   FROM node:20-alpine AS build
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   RUN npm run build

   # --- Production Stage ---
   FROM nginx:stable-alpine
   COPY --from=build /app/dist /usr/share/nginx/html
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```

2. **Create the corresponding `nginx.conf` matching SPA route requirements:**
   ```nginx
   server {
       listen 80;
       server_name localhost;

       location / {
           root /usr/share/nginx/html;
           index index.html index.htm;
           try_files $uri /index.html; # SPA routing fallback
       }

       error_page 500 502 503 504 /50x.html;
       location = /50x.html {
           root /usr/share/nginx/html;
       }
   }
   ```

### Mode C: Serverless Edge Hosting (Zero Maintenance)
Because the output contains only static files, you can deploy the `/dist/` folder directly to zero-config CDN and modern serverless platforms:
- **Vercel / Netlify / Cloudflare Pages**: Connect your repository directly; these platforms auto-detect Vite projects, execute `npm run build`, and handle asset optimization and SPA routes out of the box securely.
- **Google Cloud Storage / AWS S3**: Push the compiled `/dist/` files directly to a storage bucket configured for Web Hosting, fronted by a global Content Delivery Network (CDN) like Cloud CDN or CloudFront.
