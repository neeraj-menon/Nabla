import React, { useState, useEffect } from 'react';
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

  // Load functions on component mount
  useEffect(() => {
    const fetchFunctions = async () => {
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
    };

    fetchFunctions();
  }, [refreshTrigger]);

  // Handle refresh button click
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Handle start function
  const handleStartFunction = async (name) => {
    try {
      await functionService.startFunction(name);
      handleRefresh();
    } catch (err) {
      setError(`Failed to start function ${name}`);
    }
  };

  // Handle stop function
  const handleStopFunction = async (name) => {
    try {
      await functionService.stopFunction(name);
      handleRefresh();
    } catch (err) {
      setError(`Failed to stop function ${name}`);
    }
  };

  // Function status chip
  const StatusChip = ({ running }) => {
    return (
      <Chip 
        label={running ? 'Running' : 'Stopped'} 
        color={running ? 'success' : 'default'}
        size="small"
      />
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
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
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
                    <StatusChip running={func.running} />
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
                      >
                        <StopIcon />
                      </IconButton>
                    ) : (
                      <IconButton 
                        color="success" 
                        onClick={() => handleStartFunction(name)}
                        title="Start Function"
                      >
                        <StartIcon />
                      </IconButton>
                    )}
                    <IconButton 
                      color="error"
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
