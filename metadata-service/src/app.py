#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import uvicorn
import uuid
import datetime

app = FastAPI(title="Serverless Platform Metadata Service")
security = HTTPBearer()

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# Simple token validation for MVP
def validate_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != "dev-token":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

# Models
class FunctionCreate(BaseModel):
    name: str
    runtime: str
    image: str
    description: Optional[str] = None
    env_vars: Optional[Dict[str, str]] = None

class Function(FunctionCreate):
    id: str
    created_at: str
    updated_at: str
    status: str = "inactive"

# In-memory storage for MVP
functions_db = {}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/functions", response_model=Function, status_code=status.HTTP_201_CREATED)
def create_function(function: FunctionCreate, token: str = Depends(validate_token)):
    # Check if function with same name already exists
    for existing in functions_db.values():
        if existing.name == function.name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Function with name '{function.name}' already exists"
            )
    
    # Create function record
    function_id = str(uuid.uuid4())
    timestamp = datetime.datetime.now().isoformat()
    
    new_function = Function(
        id=function_id,
        created_at=timestamp,
        updated_at=timestamp,
        **function.dict()
    )
    
    functions_db[function_id] = new_function
    return new_function

@app.get("/functions", response_model=List[Function])
def list_functions(token: str = Depends(validate_token)):
    return list(functions_db.values())

@app.get("/functions/{function_id}", response_model=Function)
def get_function(function_id: str, token: str = Depends(validate_token)):
    if function_id not in functions_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Function with ID '{function_id}' not found"
        )
    return functions_db[function_id]

@app.get("/functions/name/{function_name}", response_model=Function)
def get_function_by_name(function_name: str, token: str = Depends(validate_token)):
    for function in functions_db.values():
        if function.name == function_name:
            return function
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Function with name '{function_name}' not found"
    )

@app.put("/functions/{function_id}", response_model=Function)
def update_function(function_id: str, function_update: FunctionCreate, token: str = Depends(validate_token)):
    if function_id not in functions_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Function with ID '{function_id}' not found"
        )
    
    existing = functions_db[function_id]
    updated = Function(
        id=function_id,
        created_at=existing.created_at,
        updated_at=datetime.datetime.now().isoformat(),
        status=existing.status,
        **function_update.dict()
    )
    
    functions_db[function_id] = updated
    return updated

@app.patch("/functions/{function_id}/status", response_model=Function)
def update_function_status(
    function_id: str, 
    status: str,
    token: str = Depends(validate_token)
):
    if function_id not in functions_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Function with ID '{function_id}' not found"
        )
    
    if status not in ["active", "inactive"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'active' or 'inactive'"
        )
    
    functions_db[function_id].status = status
    functions_db[function_id].updated_at = datetime.datetime.now().isoformat()
    
    return functions_db[function_id]

@app.delete("/functions/{function_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_function(function_id: str, token: str = Depends(validate_token)):
    if function_id not in functions_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Function with ID '{function_id}' not found"
        )
    
    del functions_db[function_id]
    return None

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8083)
