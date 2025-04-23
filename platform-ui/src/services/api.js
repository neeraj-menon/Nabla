import axios from 'axios';

// Base URLs for different services
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const BUILDER_URL = process.env.REACT_APP_BUILDER_URL || 'http://localhost:8082';
const CONTROLLER_URL = process.env.REACT_APP_CONTROLLER_URL || 'http://localhost:8081';

// Default auth token (for development)
const AUTH_TOKEN = process.env.REACT_APP_AUTH_TOKEN || 'dev-token';

// Create axios instance with default config
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`
  }
});

// Function API calls
export const functionService = {
  // Get all functions
  listFunctions: async () => {
    try {
      // Use the function controller's list endpoint directly for more accurate status
      const response = await api.get(`${CONTROLLER_URL}/list`);
      console.debug('Function list response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error listing functions:', error);
      throw error;
    }
  },
  
  // Get function details
  getFunction: async (name) => {
    try {
      // For MVP, we'll use the list endpoint and filter for the specific function
      const response = await api.get(`${API_URL}/list`);
      return response.data[name] || null;
    } catch (error) {
      console.error(`Error getting function ${name}:`, error);
      throw error;
    }
  },
  
  // Invoke a function
  invokeFunction: async (name, method = 'GET', data = {}) => {
    try {
      const response = await api({
        method,
        url: `${API_URL}/function/${name}`,
        data: method !== 'GET' ? data : undefined
      });
      return response.data;
    } catch (error) {
      console.error(`Error invoking function ${name}:`, error);
      throw error;
    }
  },
  
  // Deploy a function (upload code)
  deployFunction: async (name, fileData) => {
    try {
      const formData = new FormData();
      formData.append('file', fileData);
      formData.append('name', name);
      
      // Use different headers for file upload
      const response = await axios.post(`${BUILDER_URL}/build`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });
      
      // Register with API Gateway
      await api.post(`${API_URL}/register`, {
        name: name,
        endpoint: `http://function-controller:8081`
      });
      
      // Register with Function Controller
      await api.post(`${CONTROLLER_URL}/register`, {
        name: name,
        image: response.data.image,
        port: 0  // Let the controller assign a port
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error deploying function ${name}:`, error);
      throw error;
    }
  },
  
  // Start a function
  startFunction: async (name) => {
    try {
      const response = await api.post(`${CONTROLLER_URL}/start/${name}`);
      console.debug(`Start function ${name} response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error starting function ${name}:`, error);
      throw error;
    }
  },
  
  // Stop a function
  stopFunction: async (name) => {
    try {
      const response = await api.post(`${CONTROLLER_URL}/stop/${name}`);
      console.debug(`Stop function ${name} response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error stopping function ${name}:`, error);
      throw error;
    }
  },
  
  // Get function status
  getFunctionStatus: async (name) => {
    try {
      const response = await api.get(`${CONTROLLER_URL}/status/${name}`);
      console.debug(`Status for function ${name}:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error getting status for function ${name}:`, error);
      throw error;
    }
  }
};

export default api;
