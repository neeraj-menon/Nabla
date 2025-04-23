import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  CircularProgress,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Divider
} from '@mui/material';
import { CloudUpload as UploadIcon, Code as CodeIcon } from '@mui/icons-material';
import { functionService } from '../services/api';
import CodeEditor from '../components/CodeEditor';
import { createZipFromFiles, createFileFromZip } from '../utils/zipUtils';

function DeployFunction() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [functionName, setFunctionName] = useState('');
  const [runtime, setRuntime] = useState('python-flask');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editMode, setEditMode] = useState(true); // Default to edit mode
  const [files, setFiles] = useState([]);
  const [generatingZip, setGeneratingZip] = useState(false);

  // Available runtimes
  const runtimes = [
    { value: 'python-flask', label: 'Python (Flask)' },
    { value: 'nodejs', label: 'Node.js' },
    { value: 'go', label: 'Go' }
  ];

  // Steps for the deployment process
  const steps = ['Configure Function', 'Create/Edit Code', 'Deploy'];

  // Handle file selection
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setEditMode(false); // Switch to upload mode when a file is selected
  };

  // Handle files change from code editor
  const handleFilesChange = (updatedFiles) => {
    setFiles(updatedFiles);
  };

  // Add template files based on selected runtime
  useEffect(() => {
    if (editMode && files.length === 0) {
      let templateFiles = [];
      
      // Add default files based on runtime
      if (runtime === 'python-flask') {
        templateFiles = [
          {
            name: 'app.py',
            content: `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/', methods=['GET'])
def hello():
    return jsonify({
        "message": "Hello from your serverless function!"
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
`,
            type: 'file'
          },
          {
            name: 'requirements.txt',
            content: 'flask==2.0.1',
            type: 'file'
          }
        ];
      } else if (runtime === 'nodejs') {
        templateFiles = [
          {
            name: 'index.js',
            content: `const express = require('express');
const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from your serverless function!' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`,
            type: 'file'
          },
          {
            name: 'package.json',
            content: `{
  "name": "${functionName || 'serverless-function'}",
  "version": "1.0.0",
  "description": "A serverless function",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.17.1"
  }
}`,
            type: 'file'
          }
        ];
      } else if (runtime === 'go') {
        templateFiles = [
          {
            name: 'main.go',
            content: `package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type Response struct {
	Message string \`json:"message"\`
}

func handler(w http.ResponseWriter, r *http.Request) {
	resp := Response{Message: "Hello from your serverless function!"}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/", handler)

	log.Println("Server starting on port 8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
`,
            type: 'file'
          },
          {
            name: 'go.mod',
            content: `module ${functionName || 'serverless-function'}

go 1.16
`,
            type: 'file'
          }
        ];
      }
      
      setFiles(templateFiles);
    }
  }, [runtime, editMode, files.length, functionName]);

  // Handle form submission
  const handleDeploy = async () => {
    if (!functionName.trim()) {
      setError('Function name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      let fileToUpload = file;
      
      // If in edit mode, create a zip file from the files in the editor
      if (editMode) {
        if (files.length === 0) {
          setError('Please add at least one file');
          setLoading(false);
          return;
        }
        
        try {
          setGeneratingZip(true);
          const zipBlob = await createZipFromFiles(files);
          fileToUpload = createFileFromZip(zipBlob, `${functionName}.zip`);
          setGeneratingZip(false);
        } catch (zipErr) {
          setError(`Failed to create zip file: ${zipErr.message || 'Unknown error'}`);
          setLoading(false);
          setGeneratingZip(false);
          return;
        }
      } else if (!file) {
        setError('Please upload a zip file containing your function code');
        setLoading(false);
        return;
      }
      
      // Call the API to deploy the function
      await functionService.deployFunction(functionName, fileToUpload);
      
      setSuccess(true);
      setActiveStep(3); // Move to completion step
      
      // Navigate to the dashboard after a short delay
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (err) {
      setError(`Deployment failed: ${err.message || 'Unknown error'}`);
      console.error('Deployment error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle next step
  const handleNext = () => {
    if (activeStep === 0 && !functionName.trim()) {
      setError('Function name is required');
      return;
    }
    
    if (activeStep === 1) {
      // Only check for file if not in edit mode
      if (!editMode && !file) {
        setError('Please upload a zip file containing your function code');
        return;
      }
      
      // In edit mode, check if there are files
      if (editMode && files.length === 0) {
        setError('Please add at least one file');
        return;
      }
    }
    
    setActiveStep((prevStep) => prevStep + 1);
    setError(null);
  };

  // Handle back step
  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
    setError(null);
  };

  return (
    <div>
      <Typography variant="h4" component="h1" gutterBottom>
        Deploy Function
      </Typography>

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3 }}>
              Function deployed successfully! Redirecting to dashboard...
            </Alert>
          )}

          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Configure Function
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Function Name"
                    variant="outlined"
                    fullWidth
                    value={functionName}
                    onChange={(e) => setFunctionName(e.target.value)}
                    required
                    helperText="A unique name for your function"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Runtime</InputLabel>
                    <Select
                      value={runtime}
                      onChange={(e) => setRuntime(e.target.value)}
                      label="Runtime"
                    >
                      {runtimes.map((rt) => (
                        <MenuItem key={rt.value} value={rt.value}>
                          {rt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          )}

          {activeStep === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Create/Edit Code
              </Typography>
              
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <Button
                  variant={editMode ? "contained" : "outlined"}
                  color="primary"
                  startIcon={<CodeIcon />}
                  onClick={() => setEditMode(true)}
                  sx={{ mr: 1 }}
                >
                  Edit Code
                </Button>
                <Button
                  variant={!editMode ? "contained" : "outlined"}
                  color="primary"
                  startIcon={<UploadIcon />}
                  onClick={() => setEditMode(false)}
                >
                  Upload ZIP
                </Button>
              </Box>
              
              {editMode ? (
                <Box sx={{ mt: 2 }}>
                  <CodeEditor files={files} onFilesChange={handleFilesChange} />
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Create and edit your function files directly in the browser. The files will be automatically packaged into a ZIP file when you deploy.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 3,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 200,
                      backgroundColor: '#f9f9f9',
                      border: '2px dashed #ccc',
                      cursor: 'pointer',
                    }}
                    onClick={() => document.getElementById('function-code-upload').click()}
                  >
                    <input
                      id="function-code-upload"
                      type="file"
                      accept=".zip"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                    <Typography variant="body1" gutterBottom>
                      {file ? file.name : 'Click to upload your function code (ZIP file)'}
                    </Typography>
                    {file && (
                      <Typography variant="body2" color="textSecondary">
                        {(file.size / 1024).toFixed(2)} KB
                      </Typography>
                    )}
                  </Paper>
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Upload a ZIP file containing your function code. Make sure it includes all necessary files for your selected runtime.
                  </Typography>
                </>
              )}
            </Box>
          )}

          {activeStep === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Deploy
              </Typography>
              <Typography variant="body1" paragraph>
                Please review your function details before deployment:
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">
                      Function Name
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                      {functionName}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" color="textSecondary">
                      Runtime
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                      {runtimes.find(rt => rt.value === runtime)?.label || runtime}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" color="textSecondary">
                      Code Package
                    </Typography>
                    <Typography variant="body1">
                      {file?.name} ({(file?.size / 1024).toFixed(2)} KB)
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            {activeStep > 0 && (
              <Button
                onClick={handleBack}
                sx={{ mr: 1 }}
                disabled={loading}
              >
                Back
              </Button>
            )}
            {activeStep < steps.length - 1 ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleNext}
                disabled={loading}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={handleDeploy}
                disabled={loading || success || generatingZip}
                startIcon={(loading || generatingZip) && <CircularProgress size={20} color="inherit" />}
              >
                {loading ? 'Deploying...' : generatingZip ? 'Preparing Files...' : 'Deploy Function'}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Need Help?
          </Typography>
          <Typography variant="body2" paragraph>
            Check out our documentation for more information on deploying functions:
          </Typography>
          <Button variant="outlined">View Documentation</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default DeployFunction;
