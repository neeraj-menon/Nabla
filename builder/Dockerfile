FROM python:3.9-slim

WORKDIR /app

# Install Docker client
RUN apt-get update && \
    apt-get install -y docker.io && \
    apt-get clean

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ .

# Expose the port
EXPOSE 8082

# Run the application
CMD ["python", "build.py"]
