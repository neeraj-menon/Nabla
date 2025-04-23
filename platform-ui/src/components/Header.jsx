import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Button } from '@mui/material';
import { Notifications as NotificationsIcon, AccountCircle } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';

function Header() {
  const location = useLocation();
  
  // Determine page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/deploy') return 'Deploy Function';
    if (path.startsWith('/function/')) return 'Function Details';
    if (path === '/logs') return 'Logs';
    if (path === '/settings') return 'Settings';
    return 'Serverless Platform';
  };

  return (
    <AppBar 
      position="static" 
      color="default" 
      elevation={0}
      sx={{ 
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: 'white' 
      }}
    >
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {getPageTitle()}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton color="inherit" size="large">
            <NotificationsIcon />
          </IconButton>
          <Button 
            color="inherit" 
            startIcon={<AccountCircle />}
            sx={{ ml: 1 }}
          >
            Admin
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
