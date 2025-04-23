import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Divider,
  Switch,
  FormControlLabel,
  Alert,
  IconButton,
  InputAdornment,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ContentCopy as CopyIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

function Settings() {
  const [showToken, setShowToken] = useState(false);
  const [authToken, setAuthToken] = useState('dev-token');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiKeys, setApiKeys] = useState([
    { id: 1, name: 'Development', key: 'dev-key-12345', active: true },
    { id: 2, name: 'Testing', key: 'test-key-67890', active: true }
  ]);
  const [newKeyName, setNewKeyName] = useState('');
  
  // Toggle token visibility
  const handleToggleTokenVisibility = () => {
    setShowToken(!showToken);
  };
  
  // Copy token to clipboard
  const handleCopyToken = () => {
    navigator.clipboard.writeText(authToken);
    // Show a temporary success message
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };
  
  // Save token
  const handleSaveToken = () => {
    // In a real app, this would save to the backend
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };
  
  // Generate a new API key
  const handleGenerateKey = () => {
    if (!newKeyName.trim()) return;
    
    // Generate a mock key
    const newKey = {
      id: Date.now(),
      name: newKeyName,
      key: `key-${Math.random().toString(36).substring(2, 10)}`,
      active: true
    };
    
    setApiKeys([...apiKeys, newKey]);
    setNewKeyName('');
  };
  
  // Delete an API key
  const handleDeleteKey = (id) => {
    setApiKeys(apiKeys.filter(key => key.id !== id));
  };
  
  // Toggle API key active status
  const handleToggleKeyStatus = (id) => {
    setApiKeys(apiKeys.map(key => 
      key.id === id ? { ...key, active: !key.active } : key
    ));
  };

  return (
    <div>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Authentication
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Typography variant="subtitle2" gutterBottom>
                API Authentication Token
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                This token is used to authenticate requests to the serverless platform API.
              </Typography>
              
              <TextField
                fullWidth
                variant="outlined"
                label="Auth Token"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                type={showToken ? 'text' : 'password'}
                sx={{ mb: 2 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleToggleTokenVisibility}
                        edge="end"
                      >
                        {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                      <IconButton
                        onClick={handleCopyToken}
                        edge="end"
                      >
                        <CopyIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveToken}
              >
                Save Token
              </Button>
              
              {saveSuccess && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Operation completed successfully!
                </Alert>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                API Keys
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Typography variant="body2" color="textSecondary" paragraph>
                Manage API keys for external applications to access your functions.
              </Typography>
              
              <Box sx={{ display: 'flex', mb: 3 }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Key Name"
                  placeholder="e.g., Production"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  sx={{ mr: 2 }}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleGenerateKey}
                  disabled={!newKeyName.trim()}
                >
                  Generate
                </Button>
              </Box>
              
              <Paper variant="outlined">
                <List sx={{ p: 0 }}>
                  {apiKeys.length === 0 ? (
                    <ListItem>
                      <ListItemText
                        primary="No API keys"
                        secondary="Generate a new key to get started"
                      />
                    </ListItem>
                  ) : (
                    apiKeys.map((key) => (
                      <ListItem key={key.id} divider>
                        <ListItemText
                          primary={key.name}
                          secondary={
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                color: key.active ? 'text.primary' : 'text.disabled',
                              }}
                            >
                              {key.key}
                            </Typography>
                          }
                        />
                        <ListItemSecondaryAction>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={key.active}
                                onChange={() => handleToggleKeyStatus(key.id)}
                                color="primary"
                              />
                            }
                            label={key.active ? 'Active' : 'Inactive'}
                            labelPlacement="start"
                          />
                          <IconButton
                            edge="end"
                            onClick={() => handleDeleteKey(key.id)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))
                  )}
                </List>
              </Paper>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Platform Settings
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Enable automatic scaling"
                sx={{ display: 'block', mb: 2 }}
              />
              <Typography variant="body2" color="textSecondary" paragraph>
                Automatically scale functions based on load (Premium feature).
              </Typography>
              
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Enable function metrics"
                sx={{ display: 'block', mb: 2 }}
              />
              <Typography variant="body2" color="textSecondary" paragraph>
                Collect and display metrics for function performance.
              </Typography>
              
              <FormControlLabel
                control={<Switch />}
                label="Enable WebSocket support"
                sx={{ display: 'block', mb: 2 }}
              />
              <Typography variant="body2" color="textSecondary" paragraph>
                Allow functions to use WebSocket connections (Beta feature).
              </Typography>
              
              <Button
                variant="contained"
                color="primary"
                sx={{ mt: 2 }}
              >
                Save Settings
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Danger Zone
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Alert severity="warning" sx={{ mb: 3 }}>
                These actions cannot be undone. Please proceed with caution.
              </Alert>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Reset API Token
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  Generate a new API token. All existing applications using the current token will need to be updated.
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                >
                  Reset Token
                </Button>
              </Box>
              
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Delete All Functions
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  Remove all deployed functions and their associated data.
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                >
                  Delete All Functions
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
}

export default Settings;
