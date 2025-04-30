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
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

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
  
  // Delete function implementation using the API service
  const handleDeleteFunction = async (name) => {
    console.log(`Delete button clicked for function: ${name}`);
    
    try {
      // Set action in progress for this function
      setActionInProgress(prev => ({
        ...prev, 
        [name]: 'deleting'
      }));
      
      // Confirm deletion
      if (deleteConfirmation !== name) {
        console.log(`First click - setting confirmation for ${name}`);
        setDeleteConfirmation(name);
        // Clear confirmation after 5 seconds
        setTimeout(() => {
          setDeleteConfirmation(null);
        }, 5000);
        return;
      }
      
      console.log(`Confirmed deletion for ${name}, proceeding with delete`);
      
      // Reset confirmation state
      setDeleteConfirmation(null);
      
      // Use the API service to delete the function
      console.log(`Using functionService.deleteFunction for ${name}`);
      const response = await functionService.deleteFunction(name);
      console.log(`Delete successful:`, response);
      
      // Remove from UI after successful deletion
      setFunctions(prev => {
        const newFunctions = { ...prev };
        delete newFunctions[name];
        return newFunctions;
      });
      
      // Show success message
      setError(null);
      
      // Refresh the function list
      setTimeout(() => {
        fetchFunctions();
      }, 1000);
    } catch (err) {
      console.error(`Failed to delete function ${name}:`, err);
      setError(`Failed to delete function ${name}: ${err.message || 'Unknown error'}`);
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
            icon={<CircularProgress size={14} color="inherit" />}
            sx={{ height: '24px', borderRadius: '12px' }}
          />
        ) : (
          <Chip 
            label={running ? 'Running' : 'Stopped'} 
            color={running ? 'success' : 'default'}
            size="small"
            sx={{
              height: '24px',
              borderRadius: '12px',
              ...(running && {
                bgcolor: 'rgba(76, 175, 80, 0.1)',
                color: '#2e7d32',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
                  '70%': { boxShadow: '0 0 0 6px rgba(76, 175, 80, 0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                }
              }),
              ...(!running && {
                bgcolor: 'rgba(0, 0, 0, 0.08)',
                color: 'rgba(0, 0, 0, 0.6)'
              })
            }}
          />
        )}
      </Box>
    );
  };

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          Functions Dashboard
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            component={Link}
            to="/deploy"
            sx={{ mr: 2, textTransform: 'none', borderRadius: '4px' }}
          >
            Deploy New Function
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
            sx={{ mr: 1, textTransform: 'none', borderRadius: '4px' }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            color={autoRefreshEnabled ? "success" : "primary"}
            onClick={toggleAutoRefresh}
            sx={{ textTransform: 'none', borderRadius: '4px' }}
          >
            Auto-refresh: {autoRefreshEnabled ? "ON" : "OFF"}
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
        <Card sx={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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
                sx={{ mt: 2, textTransform: 'none', borderRadius: '4px' }}
              >
                Deploy Your First Function
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', mb: 4 }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Function Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Endpoint</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(functions).map(([name, func]) => (
                <TableRow key={name} hover>
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
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      /function/{name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      color="primary"
                      component={Link}
                      to={`/function/${name}`}
                      title="View Details"
                      size="small"
                      sx={{ mx: 0.5 }}
                    >
                      <InvokeIcon fontSize="small" />
                    </IconButton>
                    {func.running ? (
                      <IconButton
                        color="error"
                        onClick={() => handleStopFunction(name)}
                        title="Stop Function"
                        disabled={!!actionInProgress[name]}
                        size="small"
                        sx={{ mx: 0.5 }}
                      >
                        {actionInProgress[name] === 'stopping' ?
                          <CircularProgress size={20} color="inherit" /> :
                          <StopIcon fontSize="small" />}
                      </IconButton>
                    ) : (
                      <IconButton
                        color="success"
                        onClick={() => handleStartFunction(name)}
                        title="Start Function"
                        disabled={!!actionInProgress[name]}
                        size="small"
                        sx={{ mx: 0.5 }}
                      >
                        {actionInProgress[name] === 'starting' ?
                          <CircularProgress size={20} color="inherit" /> :
                          <StartIcon fontSize="small" />}
                      </IconButton>
                    )}
                    <IconButton
                      color={deleteConfirmation === name ? "error" : "default"}
                      onClick={() => handleDeleteFunction(name)}
                      title={deleteConfirmation === name ? "Click again to confirm deletion" : "Delete Function"}
                      disabled={!!actionInProgress[name]}
                      size="small"
                      sx={{ 
                        mx: 0.5,
                        '&:hover': { 
                          backgroundColor: deleteConfirmation === name ? 'rgba(211, 47, 47, 0.1)' : 'rgba(0, 0, 0, 0.04)' 
                        },
                        ...(deleteConfirmation === name && {
                          animation: 'pulse 1s infinite',
                          '@keyframes pulse': {
                            '0%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
                            '70%': { boxShadow: '0 0 0 6px rgba(211, 47, 47, 0)' },
                            '100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0)' }
                          }
                        })
                      }}
                    >
                      {actionInProgress[name] === 'deleting' ?
                        <CircularProgress size={20} color="inherit" /> :
                        <DeleteIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 500 }}>
        Platform Status
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Functions Deployed
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 500 }}>
                {Object.keys(functions).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Functions Running
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 500, color: '#4caf50' }}>
                {Object.values(functions).filter(f => f.running).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <CardContent>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Functions Stopped
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 500, color: '#9e9e9e' }}>
                {Object.values(functions).filter(f => !f.running).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      

    </div>
  );
}

export default Dashboard;
