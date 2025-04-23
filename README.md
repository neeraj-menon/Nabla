# Serverless Platform (MVP)

A lightweight serverless platform for running HTTP functions with basic authentication, single region deployment, and manual scaling.

## Features

- Deploy HTTP-triggered functions
- Basic authentication
- Single region deployment
- Manual scaling
- Supported runtimes: Python (Flask), Node.js, Go

## Components

- **API Gateway**: Routes HTTP requests to functions
- **Function Controller**: Manages function containers
- **Builder Service**: Builds function code into containers
- **Metadata Service**: Stores function metadata
- **CLI**: Developer tool for function management

## Getting Started

1. Install the CLI:
   ```
   cd cli
   npm install -g
   ```

2. Initialize a new function:
   ```
   plat init --runtime python-flask
   ```

3. Start the serverless platform (from the project root):
   ```
   docker compose up --build
   ```

4. Deploy your function:
   ```
   plat deploy
   ```

5. Invoke your function:
   ```
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/function/hello
   ```

## Development

To run the platform locally:

```
docker compose up --build
```

This command will build all necessary images and start all services as defined in your `docker-compose.yaml`.

## Architecture

The platform follows a microservices architecture with the following flow:
1. Developer deploys code via CLI
2. Builder service packages code into a container image
3. Function controller manages container lifecycle
4. API Gateway routes HTTP requests to functions

## Learn More

- docs/project-plan.md

## To Run on Windows

- docs/wsl-setup.md

## License

MIT
