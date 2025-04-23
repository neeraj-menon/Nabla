# Running the Serverless Platform on Windows using WSL

## 1. Install WSL (Windows Subsystem for Linux)

### a. Open PowerShell as Administrator and run:
```powershell
wsl --install
```
- Installs WSL and the default Ubuntu distribution.
- If you already have WSL, update it:
  ```powershell
  wsl --update
  ```

### b. Restart your computer if prompted.

### c. Set WSL 2 as default (recommended):
```powershell
wsl --set-default-version 2
```

### d. Launch Ubuntu from the Start menu and set up your username and password.

---

## 2. Install Docker in WSL

### a. **Recommended:** Install Docker Desktop for Windows
- Download from: https://www.docker.com/products/docker-desktop/
- During installation, ensure “Use WSL 2 based engine” is checked.
- After installation, launch Docker Desktop and ensure it is running.
- Docker Desktop will automatically integrate with your WSL distributions.

### b. **Alternative:** Install Docker Engine inside WSL (not recommended for beginners)
- Follow the official Docker Linux installation guide for Ubuntu:  
  https://docs.docker.com/engine/install/ubuntu/

---

## 3. Clone the Serverless Platform Repository

```bash
# In your WSL terminal (Ubuntu)
sudo apt update
sudo apt install git -y

# Clone your repository (replace with your actual repo URL)
git clone https://github.com/your-username/Serveless-Platform.git
cd Serveless-Platform/platform-repo
```

---

## 4. Build and Start the Platform

```bash
# Make sure Docker Desktop is running on Windows!
docker compose up --build
```
- This command will build all necessary images and start all services as defined in your `docker-compose.yaml`.

---

## 5. Deploy and Invoke a Function

### a. Open a new WSL terminal and navigate to the CLI directory:
```bash
cd ~/Serveless-Platform/platform-repo/cli
```

### b. Initialize a new function (example for Python Flask):
```bash
plat init --runtime python-flask
```

### c. Deploy the function:
```bash
cd my-function
plat deploy
```

### d. Invoke the function:
```bash
curl -H "Authorization: Bearer dev-token" http://localhost:8080/function/my-function
```

---

## 6. Troubleshooting

- If you encounter Docker errors, ensure Docker Desktop is running and WSL integration is enabled.
- You can check Docker Desktop settings:  
  Go to **Settings > Resources > WSL Integration** and ensure your Ubuntu distribution is checked.
- If ports are not accessible, make sure your firewall allows them (default: 8080 for API Gateway).

---

## 7. References

- [Microsoft WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Docker Desktop WSL 2 Backend](https://docs.docker.com/desktop/windows/wsl/)
- [Official Docker Compose Docs](https://docs.docker.com/compose/)
