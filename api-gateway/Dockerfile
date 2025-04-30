FROM golang:1.20-alpine AS builder

WORKDIR /app

# Copy source code
COPY src/ .

# Build the application
RUN go mod init api-gateway && \
    go get github.com/golang-jwt/jwt/v4@v4.5.0 && \
    go mod tidy && \
    go build -o api-gateway server.go

# Use a smaller image for the final container
FROM alpine:latest

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/api-gateway .

# Expose the port
EXPOSE 8080

# Run the application
CMD ["./api-gateway"]
