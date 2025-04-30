import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';

// Import pages
import Dashboard from './pages/Dashboard';
import DeployFunction from './pages/DeployFunction';
import FunctionDetail from './pages/FunctionDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';

// Import components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Import auth provider
import { AuthProvider } from './contexts/AuthContext';

// Create a theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#3f51b5',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f7fa',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
  },
});

// Layout component for authenticated pages
const AuthenticatedLayout = ({ children }) => (
  <Box sx={{ display: 'flex', height: '100vh' }}>
    <Sidebar />
    <Box sx={{ flexGrow: 1, overflow: 'auto', backgroundColor: '#f9fafb' }}>
      <Header />
      <Box component="main" sx={{ flexGrow: 1, p: 3, maxWidth: '1200px', mx: 'auto' }}>
        {children}
      </Box>
    </Box>
  </Box>
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            {/* Redirect root to login */}
            <Route path="/" element={<Navigate to="/login" />} />
            
            {/* Public route - Login page */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes - require authentication */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Dashboard />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/deploy" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <DeployFunction />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/function/:name" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <FunctionDetail />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/logs" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Logs />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/settings" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Settings />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
