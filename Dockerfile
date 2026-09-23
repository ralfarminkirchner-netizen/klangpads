FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
# Lockfile is out of sync on optional peers (ajv 6 vs 8). npm ci refuses that.
RUN npm install
COPY . .
# Static shell at / so the healthcheck and railway-start.mjs serve the app.
# VITE_BASE stays / — GitHub Pages uses /klangpads/ only in build:pages.
RUN PAGES=1 VITE_BASE=/ npm run build && VITE_BASE=/ node scripts/pages-shell.mjs --no-docs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "scripts/railway-start.mjs"]
