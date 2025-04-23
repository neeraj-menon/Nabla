FROM node:16-alpine

WORKDIR /app

# Install dependencies for health checks
RUN apk add --no-cache curl

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the source code
COPY . .

# Expose the application port
EXPOSE 3000

# Set up health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the application
CMD ["node", "index.js"]
