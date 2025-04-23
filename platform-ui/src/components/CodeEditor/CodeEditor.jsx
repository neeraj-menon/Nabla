import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Box, 
  Paper, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemIcon, 
  IconButton, 
  Divider, 
  TextField, 
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem
} from '@mui/material';
import {
  Description as FileIcon,
  Folder as FolderIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  Code as CodeIcon
} from '@mui/icons-material';

const CodeEditor = ({ files, onFilesChange }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [menuTargetFile, setMenuTargetFile] = useState(null);

  // Set initial file if available
  useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      handleFileSelect(files[0]);
    }
  }, [files]);

  // Handle file selection
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setFileContent(file.content);
  };

  // Handle file content change
  const handleEditorChange = (value) => {
    setFileContent(value);
    
    // Update the files array with the new content
    const updatedFiles = files.map(file => 
      file.name === selectedFile.name 
        ? { ...file, content: value } 
        : file
    );
    
    onFilesChange(updatedFiles);
  };

  // Handle new file creation
  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    
    // Check if file already exists
    if (files.some(file => file.name === newFileName)) {
      alert('A file with this name already exists');
      return;
    }
    
    const newFile = {
      name: newFileName,
      content: '',
      type: 'file'
    };
    
    const updatedFiles = [...files, newFile];
    onFilesChange(updatedFiles);
    setNewFileName('');
    setNewFileDialogOpen(false);
    handleFileSelect(newFile);
  };

  // Handle file deletion
  const handleDeleteFile = (fileToDelete) => {
    const updatedFiles = files.filter(file => file.name !== fileToDelete.name);
    onFilesChange(updatedFiles);
    
    // If the deleted file was selected, select another file if available
    if (selectedFile && selectedFile.name === fileToDelete.name) {
      if (updatedFiles.length > 0) {
        handleFileSelect(updatedFiles[0]);
      } else {
        setSelectedFile(null);
        setFileContent('');
      }
    }
    
    setContextMenu(null);
  };

  // Handle context menu open
  const handleContextMenu = (event, file) => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4 });
    setMenuTargetFile(file);
  };

  // Handle context menu close
  const handleContextMenuClose = () => {
    setContextMenu(null);
    setMenuTargetFile(null);
  };

  // Determine file language for syntax highlighting
  const getFileLanguage = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'go': 'go',
      'txt': 'plaintext'
    };
    
    return languageMap[extension] || 'plaintext';
  };

  return (
    <Box sx={{ display: 'flex', height: '500px', border: '1px solid #ddd' }}>
      {/* File Explorer */}
      <Paper sx={{ width: '250px', overflow: 'auto', borderRight: '1px solid #ddd' }}>
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">Files</Typography>
          <IconButton size="small" onClick={() => setNewFileDialogOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider />
        <List dense>
          {files.map((file) => (
            <ListItem
              key={file.name}
              button
              selected={selectedFile && selectedFile.name === file.name}
              onClick={() => handleFileSelect(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
              sx={{ 
                '&.Mui-selected': { 
                  backgroundColor: 'primary.light',
                  '&:hover': {
                    backgroundColor: 'primary.light',
                  }
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: '30px' }}>
                <FileIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary={file.name} 
                primaryTypographyProps={{ 
                  noWrap: true,
                  fontSize: '0.875rem'
                }} 
              />
              <IconButton 
                edge="end" 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, file);
                }}
              >
                <MoreIcon fontSize="small" />
              </IconButton>
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* Code Editor */}
      <Box sx={{ flexGrow: 1 }}>
        {selectedFile ? (
          <>
            <Box sx={{ p: 1, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center' }}>
              <CodeIcon fontSize="small" sx={{ mr: 1 }} />
              <Typography variant="subtitle2">{selectedFile.name}</Typography>
            </Box>
            <Editor
              height="calc(100% - 37px)"
              language={getFileLanguage(selectedFile.name)}
              value={fileContent}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: 'on'
              }}
            />
          </>
        ) : (
          <Box 
            sx={{ 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexDirection: 'column',
              color: 'text.secondary',
              p: 2
            }}
          >
            <Typography variant="body1" align="center" gutterBottom>
              No file selected
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={<AddIcon />}
              onClick={() => setNewFileDialogOpen(true)}
              size="small"
              sx={{ mt: 1 }}
            >
              Create a new file
            </Button>
          </Box>
        )}
      </Box>

      {/* New File Dialog */}
      <Dialog open={newFileDialogOpen} onClose={() => setNewFileDialogOpen(false)}>
        <DialogTitle>Create New File</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="File Name"
            fullWidth
            variant="outlined"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="e.g., app.py, index.js"
            helperText="Include the file extension"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFile} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem 
          onClick={() => {
            if (menuTargetFile) {
              handleDeleteFile(menuTargetFile);
            }
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default CodeEditor;
