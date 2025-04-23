#!/usr/bin/env python3
import os
import json
import shutil
import tempfile
import zipfile
import subprocess
import logging
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('builder')

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Runtime detection patterns
RUNTIME_PATTERNS = {
    'python-flask': ['requirements.txt', 'app.py', 'wsgi.py'],
    'nodejs': ['package.json', 'index.js', 'server.js'],
    'go': ['go.mod', 'main.go']
}

# Base registry URL (for MVP, using local Docker registry)
REGISTRY_URL = os.environ.get('REGISTRY_URL', 'localhost:5001')

def detect_runtime(source_dir):
    """Detect the runtime based on files in the source directory"""
    files = os.listdir(source_dir)
    
    for runtime, patterns in RUNTIME_PATTERNS.items():
        for pattern in patterns:
            if pattern in files:
                logger.info(f"Detected runtime: {runtime}")
                return runtime
    
    # Default to python-flask if no runtime detected
    logger.warning("No runtime detected, defaulting to python-flask")
    return 'python-flask'

def inject_scaffold(source_dir, runtime):
    """Inject runtime scaffold files if necessary"""
    scaffold_dir = f"/app/runtimes/{runtime}"
    
    # Check if scaffold directory exists
    if not os.path.exists(scaffold_dir):
        logger.warning(f"Scaffold directory for {runtime} not found")
        return
    
    # Copy scaffold files to source directory
    for item in os.listdir(scaffold_dir):
        src = os.path.join(scaffold_dir, item)
        dst = os.path.join(source_dir, item)
        
        # Skip if file already exists in source
        if os.path.exists(dst):
            continue
        
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    
    logger.info(f"Injected scaffold for {runtime}")

def build_image(source_dir, function_name, runtime):
    """Build Docker image using Kaniko"""
    # For MVP, using local Docker build instead of Kaniko
    image_name = f"{REGISTRY_URL}/{function_name}:latest"
    
    # For MVP, we'll use the host's localhost:5001 which is mapped to the registry container
    push_registry = 'localhost:5001'
    
    # Select the appropriate Dockerfile based on runtime
    dockerfile = f"/app/runtimes/{runtime}/Dockerfile"
    if not os.path.exists(dockerfile):
        logger.error(f"Dockerfile for runtime {runtime} not found")
        return None
    
    # Copy Dockerfile to source directory
    shutil.copy2(dockerfile, os.path.join(source_dir, "Dockerfile"))
    
    try:
        # Build the image
        cmd = ["docker", "build", "-t", image_name, source_dir]
        logger.info(f"Building image: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        
        # Tag with registry service name for internal network
        internal_image_name = f"{push_registry}/{function_name}:latest"
        if internal_image_name != image_name:
            cmd = ["docker", "tag", image_name, internal_image_name]
            logger.info(f"Tagging image for internal network: {' '.join(cmd)}")
            subprocess.run(cmd, check=True)
        
        # Push the image
        cmd = ["docker", "push", internal_image_name]
        logger.info(f"Pushing image: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        
        return image_name
    except subprocess.CalledProcessError as e:
        logger.error(f"Build failed: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    return "OK", 200

@app.route('/build', methods=['POST'])
def build_function():
    # Check if request has the file part
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    function_name = request.form.get('name')
    
    if not function_name:
        return jsonify({"error": "Function name is required"}), 400
    
    # Create a temporary directory for the build
    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract the uploaded zip file
        zip_path = os.path.join(temp_dir, "function.zip")
        file.save(zip_path)
        
        extract_dir = os.path.join(temp_dir, "src")
        os.makedirs(extract_dir)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Detect runtime
        runtime = detect_runtime(extract_dir)
        
        # Inject scaffold files
        inject_scaffold(extract_dir, runtime)
        
        # Build and push the image
        image_name = build_image(extract_dir, function_name, runtime)
        
        if not image_name:
            return jsonify({"error": "Build failed"}), 500
        
        # Return the image details
        return jsonify({
            "name": function_name,
            "image": image_name,
            "runtime": runtime
        }), 201

@app.route('/get-function-code/<function_name>', methods=['GET'])
def get_function_code(function_name):
    """Retrieve the source code for an existing function"""
    logger.info(f"Retrieving source code for function: {function_name}")
    
    # Base registry URL (for MVP, using local Docker registry)
    registry_url = os.environ.get('REGISTRY_URL', 'localhost:5001')
    image_name = f"{registry_url}/{function_name}:latest"
    
    # Create a temporary directory for extracting the code
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Create a container from the image without running it
            container_id = subprocess.check_output(
                ["docker", "create", image_name],
                universal_newlines=True
            ).strip()
            
            logger.info(f"Created temporary container {container_id} from image {image_name}")
            
            try:
                # Copy the source code from the container to the temp directory
                # We know the source code is in /app in the container based on our Dockerfiles
                subprocess.run(
                    ["docker", "cp", f"{container_id}:/app/.", temp_dir],
                    check=True
                )
                
                logger.info(f"Copied source code from container to {temp_dir}")
                
                # Create a zip file containing all the source code
                zip_path = os.path.join(temp_dir, f"{function_name}.zip")
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for root, _, files in os.walk(temp_dir):
                        for file in files:
                            # Skip the zip file itself
                            if file == f"{function_name}.zip":
                                continue
                                
                            file_path = os.path.join(root, file)
                            # Make the path relative to temp_dir
                            arcname = os.path.relpath(file_path, temp_dir)
                            zipf.write(file_path, arcname)
                
                logger.info(f"Created zip file at {zip_path}")
                
                # Return the zip file
                return send_file(
                    zip_path,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name=f"{function_name}.zip"
                )
                
            finally:
                # Clean up the container
                subprocess.run(["docker", "rm", container_id], check=True)
                logger.info(f"Removed temporary container {container_id}")
                
        except subprocess.CalledProcessError as e:
            logger.error(f"Error retrieving function code: {e}")
            return jsonify({"error": f"Failed to retrieve function code: {str(e)}"}), 500
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

if __name__ == '__main__':
    # Create runtime directories if they don't exist
    os.makedirs("/app/runtimes", exist_ok=True)
    
    # Start the Flask app
    port = int(os.environ.get('PORT', 8082))
    app.run(host='0.0.0.0', port=port)
