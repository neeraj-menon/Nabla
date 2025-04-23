FROM golang:1.17-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum
COPY go.mod ./
COPY go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o app .

# Use a smaller image for the final container
FROM alpine:latest

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/app .

# Expose the port
EXPOSE 8080

# Run the application
CMD ["./app"]
