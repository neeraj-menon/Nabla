import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  Container, 
  Grid, 
  LinearProgress, 
  Paper, 
  TextField, 
  Typography,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Divider
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';

function DeployProject() {
  const [file, setFile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const navigate = useNavigate();

  const steps = ['Select Project Files', 'Configure Project', 'Deploy'];

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'application/zip') {
      setFile(selectedFile);
      // Extract project name from filename (remove extension)
      const nameFromFile = selectedFile.name.replace(/\.[^/.]+$/, "");
      if (!projectName) {
        setProjectName(nameFromFile);
      }
      setError(null);
      setActiveStep(1);
    } else {
      setFile(null);
      setError('Please select a valid ZIP file containing your project');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      // Create form data
      const formData = new FormData();
      formData.append('project', file);
      if (projectName) {
        formData.append('name', projectName);
      }

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 300);

      // Use direct fetch with explicit token handling
      const ORCHESTRATOR_URL = process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085';
      console.log('Uploading project to:', `${ORCHESTRATOR_URL}/upload`);
      const token = localStorage.getItem('token');
      console.log('Auth token available:', !!token);
      
      const response = await fetch(`${ORCHESTRATOR_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error:', errorText);
        throw new Error(`Failed to upload project: ${response.status}`);
      }

      const data = await response.json();
      console.log('Project deployed successfully:', data);

      // Navigate to dashboard after successful upload
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error('Error uploading project:', err);
      setError(err.message || 'Failed to upload project');
      setActiveStep(1);
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (activeStep === 1) {
      handleUpload();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, borderRadius: '8px' }}>
        <Typography variant="h5" gutterBottom>
          Deploy Full-Stack Project
        </Typography>
        <Typography variant="body1" color="textSecondary" paragraph>
          Upload a ZIP file containing your full-stack application. The platform will automatically detect the structure and deploy your frontend, backend, and database.
        </Typography>

        <Divider sx={{ my: 3 }} />

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

        {activeStep === 0 && (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  p: 3,
                  border: '2px dashed #ccc',
                  borderRadius: '4px',
                  backgroundColor: '#fafafa',
                }}
              >
                <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Upload Project ZIP
                </Typography>
                <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 2 }}>
                  Your ZIP should contain your frontend, backend, and any other files needed for your application.
                </Typography>
                <Button
                  variant="contained"
                  component="label"
                  sx={{ mt: 2 }}
                >
                  Select ZIP File
                  <input
                    type="file"
                    accept=".zip"
                    hidden
                    onChange={handleFileChange}
                  />
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {activeStep === 1 && (
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Project Name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                helperText="A unique name for your project"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                rows={3}
                helperText="Optional: Describe your project"
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Selected File: {file?.name}
              </Typography>
            </Grid>
          </Grid>
        )}

        {activeStep === 2 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Deploying Project: {projectName}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={uploadProgress}
              sx={{ height: 10, borderRadius: 5, my: 2 }}
            />
            <Typography variant="body2" color="textSecondary">
              {uploadProgress < 100
                ? 'Uploading and deploying your project...'
                : 'Deployment complete! Redirecting to dashboard...'}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            disabled={activeStep === 0 || activeStep === 2}
            onClick={handleBack}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={
              (activeStep === 0 && !file) ||
              (activeStep === 1 && !projectName) ||
              activeStep === 2
            }
          >
            {activeStep === steps.length - 1 ? 'Deploy' : 'Next'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default DeployProject;
