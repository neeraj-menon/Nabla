import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Box,
  Typography,
  IconButton,
  Divider
} from '@mui/material';
import { 
  Dashboard as DashboardIcon, 
  CloudUpload as DeployIcon, 
  Code as FunctionsIcon,
  Article as LogsIcon, 
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  WarningAmber as WarningAmberIcon
} from '@mui/icons-material';

const drawerWidth = 240;

function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = useState(true);
  
  const handleDrawerToggle = () => {
    setOpen(!open);
  };
  
  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Deploy Function', icon: <DeployIcon />, path: '/deploy' },
    { text: 'Logs', icon: <LogsIcon />, path: '/logs' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? drawerWidth : 72,
        flexShrink: 0,
        transition: theme => theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        '& .MuiDrawer-paper': {
          width: open ? drawerWidth : 72,
          boxSizing: 'border-box',
          backgroundColor: 'white',
          color: 'rgba(0, 0, 0, 0.87)',
          overflowX: 'hidden',
          transition: theme => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between'
      }}>
        {open && (
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
            Nabla
          </Typography>
        )}
        <IconButton onClick={handleDrawerToggle}>
          {open ? <ChevronLeftIcon /> : <MenuIcon />}
        </IconButton>
      </Box>
      <List>
        {menuItems.map((item) => (
          <ListItem 
            button 
            component={Link} 
            to={item.path} 
            key={item.text}
            selected={location.pathname === item.path}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.2)',
                },
              },
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
              },
              my: 0.5,
              px: open ? 2 : 0,
              justifyContent: 'center',
            }}
          >
            <ListItemIcon 
              sx={{ 
                color: location.pathname === item.path ? '#1976d2' : 'rgba(0, 0, 0, 0.54)', 
                minWidth: open ? '40px' : 0,
                mr: open ? 2 : 'auto',
                ml: open ? 0 : 'auto',
                justifyContent: 'center',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {item.icon}
            </ListItemIcon>
            {open && (
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {item.text}
                    {(item.text === 'Logs' || item.text === 'Settings') && (
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                        <WarningAmberIcon sx={{ color: '#FFC107', fontSize: 18, mr: 0.5 }} />
                        <Typography variant="caption" sx={{ color: '#FFC107', fontWeight: 500 }}>
                          under dev
                        </Typography>
                      </Box>
                    )}
                  </Box>
                }
              />
            )}
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}

export default Sidebar;
