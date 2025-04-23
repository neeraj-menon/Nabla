FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install supervisor for process management
RUN pip install supervisor

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn

# Copy the application code
COPY . .

# Create supervisor configuration
RUN mkdir -p /var/log/supervisor
COPY supervisor.conf /etc/supervisor/conf.d/app.conf 2>/dev/null || echo "[program:app]\ncommand=gunicorn --bind 0.0.0.0:5000 app:app\ndirectory=/app\nautostart=true\nautorestart=true\nstdout_logfile=/var/log/supervisor/app.log\nstderr_logfile=/var/log/supervisor/app_err.log" > /etc/supervisor/conf.d/app.conf

# Expose the application port
EXPOSE 5000

# Set up health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/ || exit 1

# Run supervisor
CMD ["supervisord", "-n"]
