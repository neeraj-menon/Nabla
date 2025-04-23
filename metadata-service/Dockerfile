FROM python:3.9-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ .

# Expose the port
EXPOSE 8083

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8083"]
