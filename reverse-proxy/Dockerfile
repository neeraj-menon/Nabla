FROM golang:1.19-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Copy source code
COPY src/ ./src/

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /function-proxy ./src

# Use a small alpine image for the final container
FROM alpine:3.17

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /function-proxy /app/function-proxy

# Expose the proxy port
EXPOSE 8090

# Run the proxy
CMD ["/app/function-proxy"]
