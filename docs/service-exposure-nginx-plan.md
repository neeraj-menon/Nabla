# Service Exposure & URL Mapping Using NGINX

## Background & Motivation

Currently, when a full-stack project is deployed, its internal service port is exposed directly. This can lead to security risks, port conflicts, and a less user-friendly experience. To address this, we propose integrating NGINX as a reverse proxy to manage service exposure and provide clean, consistent public URLs for each deployed project and service.

## High-Level Architecture

- **NGINX Reverse Proxy**: Acts as the single entry point for all external traffic.
- **Dynamic Configuration**: Platform orchestrator manages NGINX config to route subdomains to correct internal service ports.
- **Subdomain Mapping**: Each deployed service gets a unique subdomain (e.g., `project-service.platform.local`).
- **Lifecycle Integration**: Public URLs are created on deploy, removed on delete.

## Implementation Plan

### 1. Add NGINX to Docker Compose
- Add an `nginx` service to `docker-compose.yaml`.
- Mount a config directory for static and dynamic configs.
- Expose HTTP/HTTPS ports (e.g., 80, 443).

### 2. NGINX Configuration
- Use a main config (`nginx.conf`) with `include` for dynamic virtual hosts.
- Each service mapping is a separate config file (e.g., `/etc/nginx/conf.d/project-service.conf`).
- Example mapping:
  ```nginx
  server {
      listen 80;
      server_name project-service.platform.local;
      location / {
          proxy_pass http://service-container:PORT;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

### 3. Platform Orchestrator Changes
- Create a `proxy`/`nginx` package to manage config files:
  - On deploy: generate a unique subdomain, create config file, reload NGINX.
  - On delete: remove config file, reload NGINX.
- Update service/project model to store `PublicURL` and `Subdomain` fields.
- Update API responses to include public URLs.

### 4. NGINX Reloading
- Use `docker exec nginx nginx -s reload` to apply config changes after updates.
- Add error handling/logging for reload failures.

### 5. Security & CORS
- Ensure proper CORS headers are set for proxied services if needed.
- Optionally restrict access to internal ports.

### 6. User Experience
- Users access their deployed services via URLs like `project-service.platform.local` instead of random ports.
- Public URLs are shown in the UI and API responses.

### 7. Migration/Transition Notes
- If currently using Traefik, plan for a smooth transition:
  - Remove Traefik service/configs.
  - Migrate existing public URL logic to NGINX-based approach.

## Example Workflow
1. User deploys a project.
2. Platform allocates a subdomain and port, generates NGINX config.
3. NGINX is reloaded, public URL is available.
4. User accesses service via `project-service.platform.local`.
5. On project deletion, config is removed and NGINX reloaded.

## References
- [NGINX Reverse Proxy Docs](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Docker Compose NGINX Example](https://docs.docker.com/samples/nginx/)

---

*Last updated: 2025-04-24*
