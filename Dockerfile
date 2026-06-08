FROM node:20-alpine

# Install Samba + required tools + native build tools
RUN apk add --no-cache samba samba-client supervisor bash curl python3 make g++

# Create smbuser for share access
RUN addgroup smbuser && \
    adduser -G smbuser -s /sbin/nologin -D smbuser && \
    echo "smbuser:password123" | chpasswd && \
    (echo "password123"; echo "password123") | smbpasswd -a -s smbuser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app
COPY . .

# Build Next.js
RUN npm run build

# Create data directory
RUN mkdir -p /app/data /app/drives && \
    chown -R node:node /app

# Copy supervisor config (manages smbd + node together)
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 3000
EXPOSE 445

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
