FROM golang:1.17-alpine AS builder

WORKDIR /app

# Copy source code
COPY src/ .

# Build the application
RUN go mod init function-controller && \
    go mod tidy && \
    go build -o function-controller .

# Use a smaller image for the final container
FROM alpine:latest

WORKDIR /app

# Install Docker client
RUN apk add --no-cache docker-cli

# Copy the binary from the builder stage
COPY --from=builder /app/function-controller .

# Expose the port
EXPOSE 8081

# Run the application
CMD ["./function-controller"]
