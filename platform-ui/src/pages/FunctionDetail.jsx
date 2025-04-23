import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
  Send as SendIcon,
  Autorenew as AutorenewIcon,
  Pause as PauseIcon
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
  const [functionData, setFunctionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // For testing function
  const [testMethod, setTestMethod] = useState('GET');
  const [testPayload, setTestPayload] = useState('');
  const [testEndpoint, setTestEndpoint] = useState('/chat');
  const [testResponse, setTestResponse] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);

  // State for tracking actions in progress
  const [actionInProgress, setActionInProgress] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  
  // Function to fetch function data
  const fetchFunctionData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Try to get function from the list first (same source as Dashboard)
      try {
        const functions = await functionService.listFunctions();
        if (functions && functions[name]) {
          console.debug(`Found function ${name} in list:`, functions[name]);
          setFunctionData(functions[name]);
          setError(null);
          setLoading(false);
          return;
        }
      } catch (listErr) {
        console.error('Failed to get function from list:', listErr);
        // Continue to fallback method
      }
      
      // Fallback: Get function details from API
      const data = await functionService.getFunction(name);
      
      if (!data) {
        setError(`Function "${name}" not found`);
        return;
      }
      
      console.debug('Function data received from fallback:', data);
      setFunctionData(data);
      setError(null);
    } catch (err) {
      setError(`Failed to load function details: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [name]);

  // Load function data on mount and when refresh is triggered
  useEffect(() => {
    fetchFunctionData();
  }, [fetchFunctionData, refreshTrigger]);
  
  // Initial data loading when component mounts
  useEffect(() => {
    // First load the function list to get accurate status (same as Dashboard)
    const loadInitialData = async () => {
      try {
        // Get the function list first (same as Dashboard)
        const functions = await functionService.listFunctions();
        console.debug('Initial functions list:', functions);
        
        if (functions && functions[name]) {
          // Use the status from the list
          setFunctionData(functions[name]);
          console.debug(`Set initial data for ${name} from list:`, functions[name]);
        } else {
          // Fallback to fetchFunctionData
          fetchFunctionData();
        }
      } catch (err) {
        console.error('Failed to load initial data from list:', err);
        // Fallback to fetchFunctionData
        fetchFunctionData();
      }
    };
    
    loadInitialData();
    
    // Set up aggressive periodic status verification (every second)
    const intervalId = setInterval(() => {
      if (!actionInProgress) {
        verifyFunctionStatus();
      }
    }, 1000); // Check every second initially
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [name, actionInProgress, fetchFunctionData]);
  
  // Auto-refresh function data every 5 seconds
  useEffect(() => {
    let intervalId;
    
    if (autoRefreshEnabled) {
      intervalId = setInterval(() => {
        // Only refresh if not in the middle of an action
        if (!actionInProgress) {
          // Use verifyFunctionStatus for more direct status checks
          verifyFunctionStatus();
        }
      }, 5000);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefreshEnabled, actionInProgress]);

  // Handle refresh
  const handleRefresh = () => {
    // First get full function data
    fetchFunctionData();
    
    // Then verify status after a short delay
    setTimeout(() => {
      verifyFunctionStatus();
    }, 500);
  };
  
  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled(prev => !prev);
  };
  
  // Verify function status - using only the list endpoint (same as Dashboard)
  const verifyFunctionStatus = async () => {
    try {
      // Get status from the list endpoint (same as Dashboard)
      const functions = await functionService.listFunctions();
      console.debug('Got functions list:', functions);
      
      // Find our function in the list
      if (functions && functions[name]) {
        const functionFromList = functions[name];
        console.debug(`Found function ${name} in list with status:`, functionFromList.running);
        
        // Update with status from list
        setFunctionData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            running: functionFromList.running,
            container: functionFromList.container,
            port: functionFromList.port
          };
        });
      } else {
        console.debug(`Function ${name} not found in list`);
      }
    } catch (err) {
      console.error(`Failed to verify status for function ${name}:`, err);
    }
  };

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Handle start function
  const handleStartFunction = async () => {
    try {
      // Set action in progress
      setActionInProgress(true);
      
      // Optimistically update UI
      setFunctionData(prev => ({
        ...prev,
        running: true
      }));
      
      // Start the function
      await functionService.startFunction(name);
      
      // Wait a moment for the container to fully start
      setTimeout(() => {
        // Verify the function status
        verifyFunctionStatus();
        // Clear action in progress
        setActionInProgress(false);
      }, 2000);
    } catch (err) {
      console.error(`Failed to start function ${name}:`, err);
      setError(`Failed to start function: ${err.message}`);
      
      // Revert optimistic update
      setFunctionData(prev => ({
        ...prev,
        running: false
      }));
      
      // Clear action in progress
      setActionInProgress(false);
    }
  };

  // Handle stop function
  const handleStopFunction = async () => {
    try {
      // Set action in progress
      setActionInProgress(true);
      
      // Optimistically update UI
      setFunctionData(prev => ({
        ...prev,
        running: false
      }));
      
      // Stop the function
      await functionService.stopFunction(name);
      
      // Wait a moment for the container to fully stop
      setTimeout(() => {
        // Verify the function status
        verifyFunctionStatus();
        // Clear action in progress
        setActionInProgress(false);
      }, 1000);
    } catch (err) {
      console.error(`Failed to stop function ${name}:`, err);
      setError(`Failed to stop function: ${err.message}`);
      
      // Revert optimistic update
      setFunctionData(prev => ({
        ...prev,
        running: true
      }));
      
      // Clear action in progress
      setActionInProgress(false);
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
      
      console.debug(`Sending ${testMethod} request to function ${name} at endpoint ${testEndpoint}:`, payload);
      
      // Invoke the function and get the response
      const response = await functionService.invokeFunction(name, testMethod, payload, testEndpoint);
      console.debug('Function response received:', response);
      
      // Check if the response has an error flag
      if (response.error) {
        setTestError(`Function invocation failed: ${response.status} ${response.data?.error || 'Unknown error'}`);
      } else {
        // Set the response data
        setTestResponse(response);
      }
    } catch (err) {
      console.error('Unexpected error during function invocation:', err);
      setTestError(`Invocation failed: ${err.message}`);
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

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          Function: {name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={actionInProgress}
            sx={{ textTransform: 'none', borderRadius: '4px' }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            onClick={toggleAutoRefresh}
            color={autoRefreshEnabled ? "success" : "inherit"}
            startIcon={autoRefreshEnabled ? <AutorenewIcon /> : <PauseIcon />}
            sx={{ textTransform: 'none', borderRadius: '4px' }}
          >
            {autoRefreshEnabled ? "Auto" : "Manual"}
          </Button>
          {functionData?.running ? (
            <Button
              variant="contained"
              color="error"
              startIcon={actionInProgress ? <CircularProgress size={20} color="inherit" /> : <StopIcon />}
              onClick={handleStopFunction}
              disabled={actionInProgress}
              sx={{ textTransform: 'none', borderRadius: '4px' }}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              startIcon={actionInProgress ? <CircularProgress size={20} color="inherit" /> : <StartIcon />}
              onClick={handleStartFunction}
              disabled={actionInProgress}
              sx={{ textTransform: 'none', borderRadius: '4px' }}
            >
              Start
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="error" sx={{ borderRadius: '4px' }}>
            {error}
          </Alert>
        </Box>
      )}

      <Card sx={{ mb: 3, borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <CardContent>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">
                Status
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={functionData?.running ? 'Running' : 'Stopped'}
                  color={functionData?.running ? 'success' : 'default'}
                  size="small"
                  sx={{
                    height: '24px',
                    borderRadius: '12px',
                    ...(functionData?.running && {
                      bgcolor: 'rgba(76, 175, 80, 0.1)',
                      color: '#2e7d32',
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': {
                        '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
                        '70%': { boxShadow: '0 0 0 6px rgba(76, 175, 80, 0)' },
                        '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                      }
                    }),
                    ...(!functionData?.running && {
                      bgcolor: 'rgba(0, 0, 0, 0.08)',
                      color: 'rgba(0, 0, 0, 0.6)'
                    })
                  }}
                  icon={actionInProgress ? <CircularProgress size={14} color="inherit" /> : undefined}
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
                {functionData?.running 
                  ? (functionData?.container || 'Running') 
                  : 'Not running'}
              </Typography>
              
              <Typography variant="subtitle2" color="textSecondary">
                Port
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {functionData?.running 
                  ? (functionData?.port || 'Assigned') 
                  : 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Paper sx={{ mb: 3, borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="function tabs">
          <Tab label="Test" />
          <Tab label="Logs" />
          <Tab label="Configuration" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
            Test Function
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Request
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Button
                    variant={testMethod === 'GET' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('GET')}
                    size="small"
                    sx={{ textTransform: 'none', borderRadius: '4px' }}
                  >
                    GET
                  </Button>
                  <Button
                    variant={testMethod === 'POST' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('POST')}
                    size="small"
                    sx={{ textTransform: 'none', borderRadius: '4px' }}
                  >
                    POST
                  </Button>
                  <Button
                    variant={testMethod === 'PUT' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('PUT')}
                    size="small"
                    sx={{ textTransform: 'none', borderRadius: '4px' }}
                  >
                    PUT
                  </Button>
                  <Button
                    variant={testMethod === 'DELETE' ? 'contained' : 'outlined'}
                    onClick={() => setTestMethod('DELETE')}
                    size="small"
                    sx={{ textTransform: 'none', borderRadius: '4px' }}
                  >
                    DELETE
                  </Button>
                </Box>
                
                <TextField
                  label="Endpoint"
                  value={testEndpoint}
                  onChange={(e) => setTestEndpoint(e.target.value)}
                  fullWidth
                  margin="normal"
                  variant="outlined"
                  placeholder="/"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '4px' } }}
                  InputProps={{
                    startAdornment: <Typography variant="body2" sx={{ mr: 1, color: 'text.secondary' }}>/function/{name}</Typography>
                  }}
                />
                {testMethod !== 'GET' && (
                  <TextField
                    label="Payload (JSON)"
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    fullWidth
                    margin="normal"
                    variant="outlined"
                    multiline
                    rows={4}
                    placeholder='{"key": "value"}'
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '4px' } }}
                  />
                )}
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    endIcon={<SendIcon />}
                    onClick={handleTestFunction}
                    disabled={testLoading || !functionData?.running}
                    fullWidth
                    sx={{ textTransform: 'none', borderRadius: '4px' }}
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
                <Box sx={{ mt: 2 }}>
                  <Alert severity="error" sx={{ borderRadius: '4px' }}>
                    {testError}
                  </Alert>
                </Box>
              )}
              
              {testLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : testResponse ? (
                <Box>
                  <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                    Status: {testResponse.status}
                  </Typography>
                  
                  <Divider sx={{ my: 1 }} />
                  
                  <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                    Headers:
                  </Typography>
                  <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {Object.entries(testResponse.headers || {}).map(([key, value]) => (
                      <div key={key}>{key}: {value}</div>
                    ))}
                  </Box>
                  
                  <Divider sx={{ my: 1 }} />
                  
                  <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                    Body:
                  </Typography>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'background.paper', 
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    overflowX: 'auto'
                  }}>
                    {typeof testResponse.data === 'object' 
                      ? JSON.stringify(testResponse.data, null, 2)
                      : testResponse.data}
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="textSecondary" sx={{ p: 3, textAlign: 'center' }}>
                  No response yet. Click "Send Request" to test the function.
                </Typography>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
            Function Logs
          </Typography>
          
          <Paper variant="outlined" sx={{ p: 2, mt: 3, borderRadius: '8px', bgcolor: 'background.paper', fontFamily: 'monospace', fontSize: '0.875rem', height: 300, overflowY: 'auto' }}>
            <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center' }}>
              {functionData?.running 
                ? 'Logs will be available soon...' 
                : 'Function is not running. Start the function to view logs.'}
            </Typography>
          </Paper>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
            Configuration
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="subtitle2" color="textSecondary">
                  Image
                </Typography>
                <Typography variant="body1" sx={{ mb: 2, fontFamily: 'monospace' }}>
                  {functionData?.image || 'N/A'}
                </Typography>
                
                <Typography variant="subtitle2" color="textSecondary">
                  Environment Variables
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {functionData?.env && Object.keys(functionData.env).length > 0 ? (
                    <Box component="pre" sx={{ 
                      p: 2, 
                      bgcolor: 'background.paper', 
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      m: 0
                    }}>
                      {JSON.stringify(functionData.env, null, 2)}
                    </Box>
                  ) : 'None'}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="subtitle2" color="textSecondary">
                  Created At
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {functionData?.createdAt ? new Date(functionData.createdAt).toLocaleString() : 'N/A'}
                </Typography>
                
                <Typography variant="subtitle2" color="textSecondary">
                  Runtime
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {functionData?.runtime || 'N/A'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </div>
  );
}

export default FunctionDetail;