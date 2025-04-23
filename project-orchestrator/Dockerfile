FROM golang:1.19-alpine

WORKDIR /app

# Install required system dependencies
RUN apk add --no-cache git zip unzip curl docker python3 py3-pip nodejs npm

# Copy go.mod and go.sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN go build -o project-orchestrator .

# Create directories
RUN mkdir -p /app/projects /app/templates

# Expose the port
EXPOSE 8085

# Run the application
CMD ["./project-orchestrator"]
