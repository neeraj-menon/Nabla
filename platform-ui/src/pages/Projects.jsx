import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CircularProgress, 
  Container, 
  Divider, 
  Grid, 
  IconButton, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Typography,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
  Alert,
  Link
} from '@mui/material';
import { 
  Refresh as RefreshIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// Project service for API calls
const projectService = {
  listProjects: async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085'}/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  },
  
  getProject: async (name) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085'}/projects/${name}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch project: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching project ${name}:`, error);
      throw error;
    }
  },
  
  startProject: async (name) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085'}/projects/${name}/start`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to start project: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error starting project ${name}:`, error);
      throw error;
    }
  },
  
  stopProject: async (name) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085'}/projects/${name}/stop`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to stop project: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error stopping project ${name}:`, error);
      throw error;
    }
  },
  
  deleteProject: async (name) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8085'}/projects/${name}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Failed to delete project: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error deleting project ${name}:`, error);
      throw error;
    }
  }
};

// Status chip component
const StatusChip = ({ status }) => {
  let color = 'default';
  let label = status || 'unknown';
  
  switch (status) {
    case 'running':
      color = 'success';
      break;
    case 'stopped':
      color = 'error';
      break;
    case 'building':
    case 'deploying':
      color = 'warning';
      break;
    case 'failed':
      color = 'error';
      break;
    default:
      color = 'default';
  }
  
  return (
    <Chip 
      label={label} 
      color={color} 
      size="small"
      sx={{ 
        textTransform: 'capitalize',
        fontWeight: 500,
        ...(status === 'running' && {
          animation: 'pulse 1.5s infinite',
          '@keyframes pulse': {
            '0%': { boxShadow: '0 0 0 0 rgba(46, 125, 50, 0.4)' },
            '70%': { boxShadow: '0 0 0 6px rgba(46, 125, 50, 0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(46, 125, 50, 0)' }
          }
        })
      }}
    />
  );
};

function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState({});
  const [selectedProject, setSelectedProject] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [projectDetails, setProjectDetails] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();
  
  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);
  
  // Fetch projects from API
  const fetchProjects = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await projectService.listProjects();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to fetch projects. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Handle refresh button click
  const handleRefresh = () => {
    fetchProjects();
  };
  
  // Handle start project
  const handleStartProject = async (name) => {
    try {
      setActionInProgress(prev => ({ ...prev, [name]: 'starting' }));
      
      // Optimistically update UI
      setProjects(prev => prev.map(project => 
        project.name === name 
          ? { ...project, status: 'deploying' } 
          : project
      ));
      
      // Start the project
      await projectService.startProject(name);
      
      // Refresh the projects list after a delay
      setTimeout(() => {
        fetchProjects();
      }, 2000);
    } catch (err) {
      console.error(`Failed to start project ${name}:`, err);
      setError(`Failed to start project ${name}: ${err.message || 'Unknown error'}`);
      
      // Revert optimistic update
      setProjects(prev => prev.map(project => 
        project.name === name 
          ? { ...project, status: 'stopped' } 
          : project
      ));
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
  
  // Handle stop project
  const handleStopProject = async (name) => {
    try {
      setActionInProgress(prev => ({ ...prev, [name]: 'stopping' }));
      
      // Optimistically update UI
      setProjects(prev => prev.map(project => 
        project.name === name 
          ? { ...project, status: 'stopped' } 
          : project
      ));
      
      // Stop the project
      await projectService.stopProject(name);
      
      // Refresh the projects list after a delay
      setTimeout(() => {
        fetchProjects();
      }, 1000);
    } catch (err) {
      console.error(`Failed to stop project ${name}:`, err);
      setError(`Failed to stop project ${name}: ${err.message || 'Unknown error'}`);
      
      // Revert optimistic update
      setProjects(prev => prev.map(project => 
        project.name === name 
          ? { ...project, status: 'running' } 
          : project
      ));
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
  
  // Handle delete project
  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [selectedProject]: 'deleting' }));
      
      // Delete the project
      await projectService.deleteProject(selectedProject);
      
      // Remove from UI
      setProjects(prev => prev.filter(project => project.name !== selectedProject));
      
      // Close the confirmation dialog
      setConfirmDelete(false);
      setSelectedProject(null);
    } catch (err) {
      console.error(`Failed to delete project ${selectedProject}:`, err);
      setError(`Failed to delete project ${selectedProject}: ${err.message || 'Unknown error'}`);
    } finally {
      // Clear action in progress
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[selectedProject];
        return newState;
      });
    }
  };
  
  // Handle view project details
  const handleViewDetails = async (name) => {
    try {
      const project = await projectService.getProject(name);
      setProjectDetails(project);
      setShowDetails(true);
    } catch (err) {
      console.error(`Failed to fetch project details for ${name}:`, err);
      setError(`Failed to fetch project details: ${err.message || 'Unknown error'}`);
    }
  };
  
  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Full-Stack Projects
        </Typography>
        <Box>
          <Button 
            variant="contained" 
            onClick={() => navigate('/deploy-project')}
            sx={{ mr: 2 }}
          >
            Deploy New Project
          </Button>
          <IconButton 
            onClick={handleRefresh} 
            disabled={refreshing}
            color="primary"
          >
            {refreshing ? <CircularProgress size={24} /> : <RefreshIcon />}
          </IconButton>
        </Box>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      <Paper sx={{ width: '100%', mb: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="textSecondary">
              No projects found. Deploy a new project to get started.
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => navigate('/deploy-project')}
              sx={{ mt: 2 }}
            >
              Deploy New Project
            </Button>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Services</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.name}>
                    <TableCell component="th" scope="row">
                      <Typography variant="body1" fontWeight={500}>
                        {project.name}
                      </Typography>
                      {project.description && (
                        <Typography variant="body2" color="textSecondary">
                          {project.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={project.status} />
                    </TableCell>
                    <TableCell>
                      {formatDate(project.createdAt)}
                    </TableCell>
                    <TableCell>
                      {Object.keys(project.services).length} services
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Tooltip title="View Details">
                          <IconButton 
                            size="small" 
                            onClick={() => handleViewDetails(project.name)}
                            disabled={!!actionInProgress[project.name]}
                          >
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        
                        {project.status === 'running' ? (
                          <Tooltip title="Stop Project">
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleStopProject(project.name)}
                              disabled={!!actionInProgress[project.name]}
                            >
                              {actionInProgress[project.name] === 'stopping' ? (
                                <CircularProgress size={20} />
                              ) : (
                                <StopIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Start Project">
                            <IconButton 
                              size="small" 
                              color="success"
                              onClick={() => handleStartProject(project.name)}
                              disabled={!!actionInProgress[project.name] || project.status === 'building' || project.status === 'deploying'}
                            >
                              {actionInProgress[project.name] === 'starting' ? (
                                <CircularProgress size={20} />
                              ) : (
                                <StartIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                        
                        <Tooltip title="Delete Project">
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => {
                              setSelectedProject(project.name);
                              setConfirmDelete(true);
                            }}
                            disabled={!!actionInProgress[project.name]}
                          >
                            {actionInProgress[project.name] === 'deleting' ? (
                              <CircularProgress size={20} />
                            ) : (
                              <DeleteIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the project "{selectedProject}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button onClick={handleDeleteProject} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Project Details Dialog */}
      <Dialog
        open={showDetails}
        onClose={() => setShowDetails(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Project Details: {projectDetails?.name}
        </DialogTitle>
        <DialogContent>
          {projectDetails && (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="textSecondary">Status</Typography>
                  <StatusChip status={projectDetails.status} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="textSecondary">Created</Typography>
                  <Typography variant="body2">{formatDate(projectDetails.createdAt)}</Typography>
                </Grid>
                {projectDetails.description && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="textSecondary">Description</Typography>
                    <Typography variant="body2">{projectDetails.description}</Typography>
                  </Grid>
                )}
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>Services</Typography>
              
              <Grid container spacing={2}>
                {Object.entries(projectDetails.services).map(([name, service]) => (
                  <Grid item xs={12} sm={6} md={4} key={name}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" fontWeight={500}>
                          {name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                          Type: {service.type}
                        </Typography>
                        <StatusChip status={service.status} />
                        
                        {service.url && (
                          <Box sx={{ mt: 2 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<OpenIcon />}
                              component="a"
                              href={service.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              disabled={service.status !== 'running'}
                            >
                              Open Service
                            </Button>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetails(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Projects;
