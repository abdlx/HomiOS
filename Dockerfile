FROM node:20-bookworm-slim

# Install only minimal OS tools (no Samba — now a separate service)
RUN apt-get update && \
    apt-get install -y bash curl util-linux && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Build Next.js
RUN npm run build

# Create required runtime directories
RUN mkdir -p /app/data /app/drives /app/data/.tus_uploads && \
    chown -R node:node /app

USER node

# Expose web port only
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start Node server directly (no supervisord needed)
CMD ["npm", "start"]
