FROM node:16-alpine as build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy the build output
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config if it exists
# This step is optional and will be skipped if nginx.conf doesn't exist
RUN touch /tmp/nginx.conf.optional
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || cp /tmp/nginx.conf.optional /tmp/nginx.conf.skip

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
