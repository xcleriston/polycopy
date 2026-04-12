FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install TypeScript globally and dependencies
RUN npm install -g typescript && npm ci --only=production --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
