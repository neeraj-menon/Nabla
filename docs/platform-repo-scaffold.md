# Platform Repository Scaffold

This monorepo supports **polyglot** user apps (React+Flask, Go-only backends, etc.) as well as the core control-plane services. Adjust as needs evolve.

```
/                                   # Root of the monorepo
├── api-gateway/                    # HTTP entrypoint microservice (Go)
│   ├── src/
│   │   └── server.go               # Routes & proxy to controller
│   └── Dockerfile                  # Build image
├── function-controller/            # Manages warm pools & invocations (Go)
│   ├── src/
│   │   └── controller.go           # Lifecycle API
│   └── Dockerfile
├── builder/                        # Builds user apps into Docker images (Python)
│   # Receives uploaded archives or Git URLs, unpacks source, detects runtime, injects scaffold, and invokes Kaniko to build the image
│   ├── src/
│   │   └── build.py                # Handles upload unpacking, runtime detection, scaffold injection, and image build
│   └── Dockerfile
├── warm-pool-manager/              # Maintains pre-warmed containers (Python)
│   ├── src/
│   │   └── pool.py                 # Idle container tracking & GC
│   └── Dockerfile
├── metadata-service/               # CRUD for functions, versions, tenants (FastAPI)
│   ├── src/
│   │   └── app.py                  # Endpoints & DB models
│   └── Dockerfile
├── cli/                            # Developer CLI (Node.js)
│   ├── src/
│   │   └── cli.js                  # `init`, `deploy`, `invoke`, `logs` commands
│   └── package.json
├── flows/                          # Prefect orchestration scripts (Python)
│   └── deploy_flow.py              # Flow: build → push → register → smoke-test
├── runtimes/                       # User app runtime templates
│   ├── python-flask/               # Flask backend + optional React frontend
│   │   ├── backend/                # Scaffold: Flask app stub
│   │   │   └── app.py
│   │   ├── frontend/               # Scaffold: React app stub (CRA/Vite)
│   │   │   └── src/App.jsx
│   │   └── Dockerfile              # Multi-stage build for full-stack app
│   ├── nodejs/                     # Node.js / React-only apps
│   │   └── Dockerfile
│   └── go/                         # Golang-only backend services
│       └── Dockerfile
├── examples/                       # Sample polyglot apps using each runtime
│   ├── hello-python-flask/         # Example: Hello World Flask + React UI
│   ├── todo-react-flask/           # Example: ToDo list app full-stack
│   └── hello-go/                   # Example: Simple Go HTTP service
├── common/                         # Shared code: configs, logging, utilities
│   ├── config/
│   └── logging/
├── infra/                          # IaC definitions
│   ├── terraform/                  # Provision VMs, registry, network
│   └── ansible/                    # Bootstrap hosts, install Docker, Kaniko
├── docs/                           # Architecture diagrams, API specs, tutorials
│   └── architecture.md
├── docker-compose.yaml             # Local dev environment with core services
└── README.md                       # Overview & getting started guide
```

## Highlights

* **Polyglot Templates** : `runtimes/` houses templates for Python/Flask + React, Node.js, and Go apps.
* **Examples** : `examples/` shows working full-stack samples you can deploy.
* **Builder** auto-detects project type and uses the appropriate scaffold and Dockerfile.
* **CLI** : support `plat init --runtime python-flask`, `--runtime go`, or `--runtime nodejs`.
* **Compose** : local dev brings up Postgres, registry, metadata, gateway, and core services.

## Next Steps

1. **Define Runtime Schemas** : decide conventions (e.g., `runtime.yaml`) for user apps.
2. **Enhance Builder** : implement language detection and scaffold injection.
3. **Populate Templates** : add starter code in each `runtimes/*` folder.
4. **CLI Enhancements** : allow `plat init` to pick and clone from `runtimes/*`.
5. **Write Tests & Docs** : unit tests for builder logic and Quickstart tutorials.

Let me know which piece you’d like to start coding or refine further!
