import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Chip, 
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert
} from '@mui/material';
import { 
  PlayArrow as StartIcon, 
  Stop as StopIcon, 
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  OpenInNew as InvokeIcon
} from '@mui/icons-material';
import { functionService } from '../services/api';

function Dashboard() {
  const [functions, setFunctions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [actionInProgress, setActionInProgress] = useState({});
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Function to fetch all functions
  const fetchFunctions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await functionService.listFunctions();
      setFunctions(data);
      setError(null);
    } catch (err) {
      setError('Failed to load functions. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load functions on component mount and when refresh is triggered
  useEffect(() => {
    fetchFunctions();
  }, [fetchFunctions, refreshTrigger]);
  
  // Auto-refresh functions every 5 seconds
  useEffect(() => {
    let intervalId;
    
    if (autoRefreshEnabled) {
      intervalId = setInterval(() => {
        fetchFunctions();
      }, 5000);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefreshEnabled, fetchFunctions]);

  // Handle refresh button click
  const handleRefresh = () => {
    fetchFunctions();
  };
  
  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled(prev => !prev);
  };

  // Handle start function
  const handleStartFunction = async (name) => {
    try {
      // Set action in progress for this function
      setActionInProgress(prev => ({ ...prev, [name]: 'starting' }));
      
      // Optimistically update UI
      setFunctions(prev => ({
        ...prev,
        [name]: { ...prev[name], running: true }
      }));
      
      // Start the function
      await functionService.startFunction(name);
      
      // Wait a moment for the container to fully start
      setTimeout(() => {
        // Verify the function status
        verifyFunctionStatus(name);
      }, 2000);
    } catch (err) {
      console.error(`Failed to start function ${name}:`, err);
      setError(`Failed to start function ${name}: ${err.message || 'Unknown error'}`);
      
      // Revert optimistic update
      setFunctions(prev => ({
        ...prev,
        [name]: { ...prev[name], running: false }
      }));
    } finally {
      // Clear action in progress after a delay
      setTimeout(() => {
        setActionInProgress(prev => {
          const newState = { ...prev };
          delete newState[name];
          return newState;
        });
      }, 1000);
    }
  };

  // Handle stop function
  const handleStopFunction = async (name) => {
    try {
      // Set action in progress for this function
      setActionInProgress(prev => ({ ...prev, [name]: 'stopping' }));
      
      // Optimistically update UI
      setFunctions(prev => ({
        ...prev,
        [name]: { ...prev[name], running: false }
      }));
      
      // Stop the function
      await functionService.stopFunction(name);
      
      // Wait a moment for the container to fully stop
      setTimeout(() => {
        // Verify the function status
        verifyFunctionStatus(name);
      }, 1000);
    } catch (err) {
      console.error(`Failed to stop function ${name}:`, err);
      setError(`Failed to stop function ${name}: ${err.message || 'Unknown error'}`);
      
      // Revert optimistic update
      setFunctions(prev => ({
        ...prev,
        [name]: { ...prev[name], running: true }
      }));
    } finally {
      // Clear action in progress after a delay
      setTimeout(() => {
        setActionInProgress(prev => {
          const newState = { ...prev };
          delete newState[name];
          return newState;
        });
      }, 1000);
    }
  };
  
  // Verify function status using the list endpoint
  const verifyFunctionStatus = async (name) => {
    try {
      // Get the full list of functions
      const functions = await functionService.listFunctions();
      console.debug('Got functions list for verification:', functions);
      
      // Check if the function exists in the list
      if (functions && functions[name]) {
        const functionFromList = functions[name];
        console.debug(`Found function ${name} in list with status:`, functionFromList.running);
        
        // Update with status from list
        setFunctions(prev => ({
          ...prev,
          [name]: { 
            ...prev[name], 
            running: functionFromList.running,
            container: functionFromList.container,
            port: functionFromList.port
          }
        }));
      } else {
        console.debug(`Function ${name} not found in list`);
      }
    } catch (err) {
      console.error(`Failed to verify status for function ${name}:`, err);
    }
  };

  // Function status chip
  const StatusChip = ({ running, functionName }) => {
    const isActionInProgress = actionInProgress[functionName];
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {isActionInProgress ? (
          <Chip 
            label={isActionInProgress === 'starting' ? 'Starting...' : 'Stopping...'} 
            color={isActionInProgress === 'starting' ? 'warning' : 'error'}
            size="small"
            icon={<CircularProgress size={16} color="inherit" />}
          />
        ) : (
          <Chip 
            label={running ? 'Running' : 'Stopped'} 
            color={running ? 'success' : 'default'}
            size="small"
            sx={{
              ...(running && {
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
                  '70%': { boxShadow: '0 0 0 6px rgba(76, 175, 80, 0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                }
              })
            }}
          />
        )}
      </Box>
    );
  };

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Functions Dashboard
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            component={Link}
            to="/deploy"
            sx={{ mr: 2 }}
          >
            Deploy New Function
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            color={autoRefreshEnabled ? "success" : "primary"}
            onClick={toggleAutoRefresh}
          >
            {autoRefreshEnabled ? "Auto-refresh: ON" : "Auto-refresh: OFF"}
          </Button>
        </Box>
      </Box>

      {error && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : Object.keys(functions).length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="textSecondary" gutterBottom>
                No functions deployed yet
              </Typography>
              <Button
                variant="contained"
                color="primary"
                component={Link}
                to="/deploy"
                sx={{ mt: 2 }}
              >
                Deploy Your First Function
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Function Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Endpoint</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(functions).map(([name, func]) => (
                <TableRow key={name}>
                  <TableCell>
                    <Link to={`/function/${name}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                        {name}
                      </Typography>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusChip running={func.running} functionName={name} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      /function/{name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      color="primary"
                      component={Link}
                      to={`/function/${name}`}
                      title="View Details"
                    >
                      <InvokeIcon />
                    </IconButton>
                    {func.running ? (
                      <IconButton
                        color="error"
                        onClick={() => handleStopFunction(name)}
                        title="Stop Function"
                        disabled={!!actionInProgress[name]}
                      >
                        {actionInProgress[name] === 'stopping' ?
                          <CircularProgress size={24} color="inherit" /> :
                          <StopIcon />}
                      </IconButton>
                    ) : (
                      <IconButton
                        color="success"
                        onClick={() => handleStartFunction(name)}
                        title="Start Function"
                        disabled={!!actionInProgress[name]}
                      >
                        {actionInProgress[name] === 'starting' ?
                          <CircularProgress size={24} color="inherit" /> :
                          <StartIcon />}
                      </IconButton>
                    )}
                    <IconButton
                      color="secondary"
                      title="Delete Function"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Grid container spacing={3} sx={{ mt: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Platform Status
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                <div>
                  <Typography variant="body2" color="textSecondary">
                    Functions Deployed
                  </Typography>
                  <Typography variant="h4">
                    {Object.keys(functions).length}
                  </Typography>
                </div>
                <div>
                  <Typography variant="body2" color="textSecondary">
                    Functions Running
                  </Typography>
                  <Typography variant="h4">
                    {Object.values(functions).filter(f => f.running).length}
                  </Typography>
                </div>
                <div>
                  <Typography variant="body2" color="textSecondary">
                    Functions Stopped
                  </Typography>
                  <Typography variant="h4">
                    {Object.values(functions).filter(f => !f.running).length}
                  </Typography>
                </div>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <Button variant="outlined" component={Link} to="/deploy">
                  Deploy Function
                </Button>
                <Button variant="outlined" component={Link} to="/logs">
                  View Logs
                </Button>
                <Button variant="outlined" component={Link} to="/settings">
                  Settings
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
}

export default Dashboard;
