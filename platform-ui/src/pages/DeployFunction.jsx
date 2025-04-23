import React, { useState } from 'react';
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
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { functionService } from '../services/api';

function DeployFunction() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [functionName, setFunctionName] = useState('');
  const [runtime, setRuntime] = useState('python-flask');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Available runtimes
  const runtimes = [
    { value: 'python-flask', label: 'Python (Flask)' },
    { value: 'nodejs', label: 'Node.js' },
    { value: 'go', label: 'Go' }
  ];

  // Steps for the deployment process
  const steps = ['Configure Function', 'Upload Code', 'Deploy'];

  // Handle file selection
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
  };

  // Handle form submission
  const handleDeploy = async () => {
    if (!functionName.trim()) {
      setError('Function name is required');
      return;
    }

    if (!file) {
      setError('Please upload a zip file containing your function code');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Call the API to deploy the function
      await functionService.deployFunction(functionName, file);
      
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
    
    if (activeStep === 1 && !file) {
      setError('Please upload a zip file containing your function code');
      return;
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
                Upload Code
              </Typography>
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
                disabled={loading || success}
                startIcon={loading && <CircularProgress size={20} color="inherit" />}
              >
                {loading ? 'Deploying...' : 'Deploy Function'}
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
