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
  invokeFunction: async (name, method = 'GET', data = {}, endpoint = '') => {
    try {
      console.debug(`Invoking function ${name} with method ${method} at endpoint ${endpoint}:`, data);
      
      // Prepare the URL with the endpoint if provided
      const functionUrl = endpoint 
        ? `${API_URL}/function/${name}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
        : `${API_URL}/function/${name}`;
      
      console.debug('Function request URL:', functionUrl);
      
      // Set a longer timeout for function invocation
      const response = await api({
        method,
        url: functionUrl,
        data: method !== 'GET' ? data : undefined,
        timeout: 10000, // 10 second timeout
        validateStatus: status => true // Accept any status code to handle function errors
      });
      
      console.debug(`Function ${name} response:`, {
        status: response.status,
        headers: response.headers,
        data: response.data
      });
      
      // Return a more complete response object
      return {
        status: response.status,
        headers: response.headers,
        data: response.data
      };
    } catch (error) {
      console.error(`Error invoking function ${name}:`, error);
      
      // Return a structured error response
      return {
        status: error.response?.status || 500,
        headers: error.response?.headers || {},
        data: error.response?.data || { error: error.message },
        error: true
      };
    }
  },
  
  // Get function code as a zip file
  getFunctionCode: async (name) => {
    try {
      console.debug(`Getting code for function ${name}`);
      
      // Use axios to get the file with responseType blob
      const response = await axios({
        method: 'GET',
        url: `${BUILDER_URL}/get-function-code/${name}`,
        responseType: 'blob',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });
      
      // Return the blob directly
      return response.data;
    } catch (error) {
      console.error(`Error getting function code for ${name}:`, error);
      throw error;
    }
  },
  
  // Deploy a function (upload code)
  deployFunction: async (name, fileData, isRedeployment = false) => {
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
      
      // If this is a redeployment, we don't need to register with API Gateway
      // since the function is already registered
      if (!isRedeployment) {
        // Register with API Gateway
        await api.post(`${API_URL}/register`, {
          name: name,
          endpoint: `http://function-controller:8081`
        });
      }
      
      // Always register with Function Controller to update the image
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
  
  // Get function status (using list endpoint to avoid CORS issues)
  getFunctionStatus: async (name) => {
    try {
      // Use the list endpoint instead of status endpoint to avoid CORS issues
      const response = await api.get(`${CONTROLLER_URL}/list`);
      console.debug(`Got function list to check status for ${name}:`, response.data);
      
      // Find the function in the list
      if (response.data && response.data[name]) {
        return response.data[name];
      } else {
        throw new Error(`Function ${name} not found in list`);
      }
    } catch (error) {
      console.error(`Error getting status for function ${name}:`, error);
      throw error;
    }
  },
  
  // Delete a function
  deleteFunction: async (name) => {
    try {
      // Using POST instead of DELETE to avoid potential CORS or framework limitations
      const response = await api.post(`${CONTROLLER_URL}/delete/${name}`);
      console.debug(`Delete function ${name} response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error deleting function ${name}:`, error);
      throw error;
    }
  }
};

export default api;
