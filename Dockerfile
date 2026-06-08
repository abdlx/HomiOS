FROM node:20-bookworm-slim

# Install Samba + required tools
RUN apt-get update && \
    apt-get install -y samba smbclient supervisor bash curl && \
    rm -rf /var/lib/apt/lists/*

# Create smbuser for share access
RUN groupadd smbuser && \
    useradd -g smbuser -s /usr/sbin/nologin -d /dev/null smbuser && \
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
RUN mkdir -p /app/data /app/drives /var/log/supervisor /var/log/samba && \
    touch /var/log/node.log && \
    chown node:node /var/log/node.log && \
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
