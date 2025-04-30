#!/usr/bin/env python3
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import uuid
import datetime
import jwt
import time

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION = 3600  # 1 hour in seconds
DB_PATH = os.environ.get("DB_PATH", "/app/data/users.db")

# Ensure data directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Initialize database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

# Helper functions
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def generate_token(user_id, username):
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": int(time.time()) + JWT_EXPIRATION
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# Authentication middleware
def auth_required(f):
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header required"}), 401
        
        token = auth_header.split(" ")[1]
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        
        # Add user info to request
        request.user = payload
        return f(*args, **kwargs)
    
    decorated.__name__ = f.__name__
    return decorated

# Routes
@app.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    
    # Validate input
    if not data or not all(k in data for k in ["username", "email", "password"]):
        return jsonify({"error": "Username, email, and password are required"}), 400
    
    username = data["username"]
    email = data["email"]
    password = data["password"]
    
    # Validate password strength (optional)
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters long"}), 400
    
    # Check if username or email already exists
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
    existing_user = cursor.fetchone()
    
    if existing_user:
        conn.close()
        return jsonify({"error": "Username or email already exists"}), 409
    
    # Create new user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    password_hash = generate_password_hash(password)
    
    cursor.execute(
        "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
        (user_id, username, email, password_hash)
    )
    conn.commit()
    conn.close()
    
    return jsonify({
        "message": "User registered successfully",
        "user_id": user_id,
        "username": username
    }), 201

@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    
    # Validate input
    if not data or not all(k in data for k in ["username", "password"]):
        return jsonify({"error": "Username and password are required"}), 400
    
    username = data["username"]
    password = data["password"]
    
    # Check credentials
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401
    
    # Generate JWT token
    token = generate_token(user["id"], user["username"])
    
    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"]
        }
    })

@app.route("/auth/me", methods=["GET"])
@auth_required
def get_current_user():
    # Get user details from database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, created_at FROM users WHERE id = ?", (request.user["user_id"],))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "created_at": user["created_at"]
    })

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "auth-service",
        "timestamp": datetime.datetime.now().isoformat()
    })

# Initialize the database when the app starts
init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8084, debug=False)
