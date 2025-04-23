# Serverless Platform UI

A modern web interface for the Serverless Platform, providing a visual way to manage, deploy, and monitor serverless functions.

## 🧠 Purpose of the Frontend

This UI enhances the Serverless Platform by:

1. **Creating a polished product experience** - A clean, intuitive frontend creates the perception of a complete platform, not just infrastructure code.

2. **Enabling non-CLI users** - Not everyone is comfortable with command-line interfaces. This visual interface broadens the user base.

3. **Showcasing capabilities visually** - Deploying, invoking, inspecting logs, and checking status — all in one place.

4. **Laying groundwork for future features** - Support for secrets, multi-tenancy, usage analytics, and previews can be added later.

## 🖥️ Core Features

| Page               | What It Does                                                                 |
|--------------------|----------------------------------------------------------------------------|
| **Dashboard**       | View all deployed functions at a glance, with status (running, error, etc). |
| **Deploy Function** | Upload code, select runtime, and deploy — replicating `plat deploy`.        |
| **Function Detail** | Inspect runtime config, update metadata, redeploy.                          |
| **Logs**            | View logs by function or invocation ID.                                     |
| **Settings**        | Manage API keys, auth tokens, profile-level settings.                       |

## 🛠️ Technology Stack

- **React** - Frontend library for building user interfaces
- **React Router** - For navigation between pages
- **Material UI** - Component library for consistent design
- **Axios** - HTTP client for API requests

## 📁 Project Structure

```
platform-ui/
├── components/       # Reusable UI components
│   ├── Header.jsx    # Top navigation bar
│   └── Sidebar.jsx   # Side navigation menu
├── pages/            # Main application pages
│   ├── Dashboard.jsx        # Overview of all functions
│   ├── DeployFunction.jsx   # Deploy new functions
│   ├── FunctionDetail.jsx   # View and manage a specific function
│   ├── Logs.jsx             # View function logs
│   └── Settings.jsx         # Platform settings
├── services/         # API service layer
│   └── api.js        # API client for backend communication
└── App.jsx           # Main application component
```

## 🚀 Running the Serverless Platform

### Option 1: Running the entire platform with Docker Compose

1. From the project root directory, run:

```bash
docker compose up --build
```

2. Access the UI at http://localhost:3000
3. The backend services will be available at:
   - API Gateway: http://localhost:8080
   - Function Controller: http://localhost:8081
   - Builder Service: http://localhost:8082
   - Metadata Service: http://localhost:8083

### Option 2: Running the UI in development mode

1. Navigate to the platform-ui directory:

```bash
cd platform-ui
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm start
```

4. Access the UI at http://localhost:3000

5. Make sure the backend services are running (in another terminal):

```bash
cd ..
docker compose up --build api-gateway function-controller builder metadata-service registry
```

## 🔑 Authentication

The platform uses a simple token-based authentication system. The default token is `dev-token`. You can change this in the Settings page or by modifying the environment variables in the docker-compose.yaml file.

## 🧩 Future Enhancements

- **Live Logs** with WebSocket streaming
- **Drag‑and‑Drop Deploy** for code folders or zip files
- **Invocation Tester** – Run function inline from UI
- **Realtime Metrics** – Charts for latency, errors, etc.

## 📚 Related Documentation

For more information on the Serverless Platform components, see the main README.md file in the project root directory.
