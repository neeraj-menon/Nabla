import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField,
  Button,
  Divider,
  Card,
  CardContent,
  IconButton,
  Chip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

function Logs() {
  const [selectedFunction, setSelectedFunction] = useState('all');
  const [timeRange, setTimeRange] = useState('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  
  // Mock function list - in a real app, this would come from an API
  const functions = [
    { name: 'hello-world', id: 'hello-world' },
    { name: 'image-processor', id: 'image-processor' },
    { name: 'data-api', id: 'data-api' }
  ];
  
  // Mock log data - in a real app, this would come from an API
  const mockLogs = [
    { 
      id: '1', 
      timestamp: '2025-04-22T13:05:12Z', 
      function: 'hello-world', 
      level: 'INFO', 
      message: 'Function invoked with GET request' 
    },
    { 
      id: '2', 
      timestamp: '2025-04-22T13:05:13Z', 
      function: 'hello-world', 
      level: 'INFO', 
      message: 'Request processed successfully' 
    },
    { 
      id: '3', 
      timestamp: '2025-04-22T13:10:45Z', 
      function: 'image-processor', 
      level: 'ERROR', 
      message: 'Failed to process image: Invalid format' 
    },
    { 
      id: '4', 
      timestamp: '2025-04-22T13:12:22Z', 
      function: 'data-api', 
      level: 'WARN', 
      message: 'Database connection pool running low' 
    },
    { 
      id: '5', 
      timestamp: '2025-04-22T13:15:01Z', 
      function: 'data-api', 
      level: 'INFO', 
      message: 'API request received for /users endpoint' 
    }
  ];
  
  // Filter logs based on selected criteria
  const filteredLogs = mockLogs.filter(log => {
    // Filter by function
    if (selectedFunction !== 'all' && log.function !== selectedFunction) {
      return false;
    }
    
    // Filter by log level
    if (logLevel !== 'all' && log.level !== logLevel) {
      return false;
    }
    
    // Filter by search query
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
  
  // Get log level color
  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR':
        return 'error';
      case 'WARN':
        return 'warning';
      case 'INFO':
        return 'info';
      case 'DEBUG':
        return 'default';
      default:
        return 'default';
    }
  };
  
  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };
  
  // Handle clear filters
  const handleClearFilters = () => {
    setSelectedFunction('all');
    setTimeRange('1h');
    setSearchQuery('');
    setLogLevel('all');
  };

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Function Logs
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            sx={{ mr: 2 }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
          >
            Export Logs
          </Button>
        </Box>
      </Box>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Log Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Function</InputLabel>
                <Select
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  label="Function"
                >
                  <MenuItem value="all">All Functions</MenuItem>
                  {functions.map((func) => (
                    <MenuItem key={func.id} value={func.id}>
                      {func.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Time Range</InputLabel>
                <Select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  label="Time Range"
                >
                  <MenuItem value="15m">Last 15 minutes</MenuItem>
                  <MenuItem value="1h">Last hour</MenuItem>
                  <MenuItem value="6h">Last 6 hours</MenuItem>
                  <MenuItem value="24h">Last 24 hours</MenuItem>
                  <MenuItem value="7d">Last 7 days</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Log Level</InputLabel>
                <Select
                  value={logLevel}
                  onChange={(e) => setLogLevel(e.target.value)}
                  label="Log Level"
                >
                  <MenuItem value="all">All Levels</MenuItem>
                  <MenuItem value="ERROR">Error</MenuItem>
                  <MenuItem value="WARN">Warning</MenuItem>
                  <MenuItem value="INFO">Info</MenuItem>
                  <MenuItem value="DEBUG">Debug</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                variant="outlined"
                label="Search Logs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                  endAdornment: searchQuery ? (
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon />
                    </IconButton>
                  ) : null
                }}
              />
            </Grid>
          </Grid>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="text"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
            >
              Clear Filters
            </Button>
          </Box>
        </CardContent>
      </Card>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="subtitle1">
            Showing {filteredLogs.length} log entries
          </Typography>
        </Box>
        <Box
          sx={{
            maxHeight: 500,
            overflow: 'auto',
            backgroundColor: '#f8f9fa',
          }}
        >
          {filteredLogs.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body1" color="textSecondary">
                No logs match your current filters
              </Typography>
            </Box>
          ) : (
            filteredLogs.map((log) => (
              <Box
                key={log.id}
                sx={{
                  p: 2,
                  borderBottom: '1px solid #e0e0e0',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  },
                }}
              >
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={2} md={1}>
                    <Chip
                      label={log.level}
                      size="small"
                      color={getLevelColor(log.level)}
                    />
                  </Grid>
                  <Grid item xs={3} md={2}>
                    <Typography variant="body2" color="textSecondary">
                      {formatTimestamp(log.timestamp)}
                    </Typography>
                  </Grid>
                  <Grid item xs={3} md={2}>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {log.function}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <Typography variant="body2">
                      {log.message}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            ))
          )}
        </Box>
      </Paper>
      
      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="textSecondary">
          Note: This is a preview of the logs feature. In the future, logs will be streamed in real-time.
        </Typography>
      </Box>
    </div>
  );
}

export default Logs;
