import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Divider,
  Paper,
  Tab,
  Tabs,
  CircularProgress,
  Alert,
  TextField,
  IconButton
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { functionService } from '../services/api';

// Tab panel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`function-tabpanel-${index}`}
      aria-labelledby={`function-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function FunctionDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [functionData, setFunctionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // For testing function
  const [testMethod, setTestMethod] = useState('GET');
  const [testPayload, setTestPayload] = useState('');
  const [testResponse, setTestResponse] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);

  // Load function data
  useEffect(() => {
    const fetchFunctionData = async () => {
      try {
        setLoading(true);
        // Get function details from API
        const data = await functionService.getFunction(name);
        
        if (!data) {
          setError(`Function "${name}" not found`);
          return;
        }
        
        setFunctionData(data);
        setError(null);
      } catch (err) {
        setError(`Failed to load function details: ${err.message}`);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchFunctionData();
  }, [name, refreshTrigger]);

  // Handle refresh
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Handle start function
  const handleStartFunction = async () => {
    try {
      await functionService.startFunction(name);
      handleRefresh();
    } catch (err) {
      setError(`Failed to start function: ${err.message}`);
    }
  };

  // Handle stop function
  const handleStopFunction = async () => {
    try {
      await functionService.stopFunction(name);
      handleRefresh();
    } catch (err) {
      setError(`Failed to stop function: ${err.message}`);
    }
  };

  // Handle test function
  const handleTestFunction = async () => {
    try {
      setTestLoading(true);
      setTestError(null);
      setTestResponse(null);
      
      let payload = null;
      if (testPayload.trim()) {
        try {
          payload = JSON.parse(testPayload);
        } catch (err) {
          setTestError('Invalid JSON payload');
          setTestLoading(false);
          return;
        }
      }
      
      const response = await functionService.invokeFunction(name, testMethod, payload);
      setTestResponse(response);
    } catch (err) {
      setTestError(`Invocation failed: ${err.message}`);
      console.error(err);
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !functionData) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Function: {name}
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            sx={{ mr: 2 }}
          >
            Refresh
          </Button>
          {functionData?.running ? (
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStopFunction}
            >
              Stop Function
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              startIcon={<StartIcon />}
              onClick={handleStartFunction}
            >
              Start Function
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">
                Status
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={functionData?.running ? 'Running' : 'Stopped'}
                  color={functionData?.running ? 'success' : 'default'}
                />
              </Box>
              
              <Typography variant="subtitle2" color="textSecondary">
                Endpoint
              </Typography>
              <Typography variant="body1" sx={{ mb: 2, fontFamily: 'monospace' }}>
                /function/{name}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">
                Container
              </Typography>
              <Typography variant="body1" sx={{ mb: 2, fontFamily: 'monospace' }}>
                {functionData?.container || 'Not running'}
              </Typography>
              
              <Typography variant="subtitle2" color="textSecondary">
                Port
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {functionData?.port || 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="function tabs">
          <Tab label="Test" />
          <Tab label="Logs" />
          <Tab label="Configuration" />
        </Tabs>
        
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>
            Test Function
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', mb: 2 }}>
                  <Button
                    variant={testMethod === 'GET' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('GET')}
                    sx={{ mr: 1 }}
                  >
                    GET
                  </Button>
                  <Button
                    variant={testMethod === 'POST' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('POST')}
                    sx={{ mr: 1 }}
                  >
                    POST
                  </Button>
                  <Button
                    variant={testMethod === 'PUT' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('PUT')}
                    sx={{ mr: 1 }}
                  >
                    PUT
                  </Button>
                  <Button
                    variant={testMethod === 'DELETE' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('DELETE')}
                  >
                    DELETE
                  </Button>
                </Box>
                
                {testMethod !== 'GET' && (
                  <TextField
                    label="Request Payload (JSON)"
                    multiline
                    rows={4}
                    fullWidth
                    variant="outlined"
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    sx={{ mb: 2 }}
                    placeholder='{"key": "value"}'
                  />
                )}
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    endIcon={<SendIcon />}
                    onClick={handleTestFunction}
                    disabled={testLoading}
                  >
                    {testLoading ? 'Sending...' : 'Send Request'}
                  </Button>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Response
              </Typography>
              
              {testError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {testError}
                </Alert>
              )}
              
              {testLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : testResponse ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxHeight: 300,
                    overflow: 'auto',
                    backgroundColor: '#f5f5f5',
                    fontFamily: 'monospace',
                  }}
                >
                  <pre>{JSON.stringify(testResponse, null, 2)}</pre>
                </Paper>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: '#f5f5f5',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                  }}
                >
                  No response yet. Send a request to see the result.
                </Paper>
              )}
            </Grid>
          </Grid>
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>
            Function Logs
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              height: 300,
              overflow: 'auto',
              backgroundColor: '#1e1e1e',
              color: '#f1f1f1',
              fontFamily: 'monospace',
            }}
          >
            <Typography variant="body2">
              Logs will be available in a future update.
            </Typography>
          </Paper>
        </TabPanel>
        
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>
            Function Configuration
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">
                  Image
                </Typography>
                <Typography variant="body1" sx={{ mb: 2, fontFamily: 'monospace' }}>
                  {functionData?.image || 'N/A'}
                </Typography>
                
                <Typography variant="subtitle2" color="textSecondary">
                  Environment Variables
                </Typography>
                {functionData?.env && Object.keys(functionData.env).length > 0 ? (
                  Object.entries(functionData.env).map(([key, value]) => (
                    <Box key={key} sx={{ mb: 1 }}>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                        {key}:
                      </Typography>{' '}
                      <Typography variant="body2" component="span">
                        {value}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    No environment variables
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Paper>
        </TabPanel>
      </Paper>
    </div>
  );
}

export default FunctionDetail;
