#!/usr/bin/env python3
import requests
import json
import time

# Base URL for the auth service
BASE_URL = "http://localhost:8084"

def test_register():
    """Test user registration"""
    print("\n=== Testing User Registration ===")
    
    # Test data
    user_data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123"
    }
    
    # Send registration request
    response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    
    # Print response
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json()

def test_login(username="testuser", password="password123"):
    """Test user login"""
    print("\n=== Testing User Login ===")
    
    # Test data
    login_data = {
        "username": username,
        "password": password
    }
    
    # Send login request
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    
    # Print response
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json().get("token")

def test_me(token):
    """Test getting current user info"""
    print("\n=== Testing Get Current User ===")
    
    # Send request with token
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    # Print response
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_invalid_token():
    """Test with invalid token"""
    print("\n=== Testing Invalid Token ===")
    
    # Send request with invalid token
    headers = {"Authorization": "Bearer invalid-token"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    # Print response
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def test_health():
    """Test health endpoint"""
    print("\n=== Testing Health Endpoint ===")
    
    # Send request
    response = requests.get(f"{BASE_URL}/health")
    
    # Print response
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

def main():
    """Run all tests"""
    print("Starting Auth Service Tests...")
    
    # Test health endpoint
    test_health()
    
    # Test registration
    register_response = test_register()
    
    # Wait a bit to ensure registration is processed
    time.sleep(1)
    
    # Test login
    token = test_login()
    
    # Test getting user info
    if token:
        test_me(token)
    
    # Test invalid token
    test_invalid_token()
    
    print("\nTests completed!")

if __name__ == "__main__":
    main()
