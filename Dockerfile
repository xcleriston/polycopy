FROM node:20-alpine
# Node 20 é requerido pelo viem (BigInt literals, ES2022 runtime). Era node:18
# antes do cutover V2 — node 18 funciona pra build mas crasha em runtime quando
# a SDK clob-client-v2 carrega ox/viem.

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm ci --ignore-scripts

# Install @types/node globally
RUN npm install -g @types/node

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to keep image small
RUN npm prune --production

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
