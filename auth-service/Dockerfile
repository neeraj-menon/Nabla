FROM python:3.9-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose the port
EXPOSE 8084

# Run the application
CMD ["python", "app.py"]
