import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Avatar, Badge, InputBase } from '@mui/material';
import { Notifications as NotificationsIcon, Search as SearchIcon } from '@mui/icons-material';
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

          <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
            <Avatar 
              sx={{ 
                bgcolor: '#1976d2',
                width: 32, 
                height: 32,
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              A
            </Avatar>
            <Box sx={{ ml: 1, display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" sx={{ fontWeight: 'medium', lineHeight: 1.2 }}>
                Admin User
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1 }}>
                Administrator
              </Typography>
            </Box>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
