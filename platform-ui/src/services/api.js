import axios from 'axios';

// Base URLs for different services
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const BUILDER_URL = process.env.REACT_APP_BUILDER_URL || 'http://localhost:8082';
const CONTROLLER_URL = process.env.REACT_APP_CONTROLLER_URL || 'http://localhost:8081';

// Create axios instance with default config
const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a request interceptor to include the auth token from localStorage
api.interceptors.request.use(config => {
  // Get token from localStorage
  const token = localStorage.getItem('token');
  
  // If token exists, add it to the request headers
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // Fallback to dev token for development
    const devToken = process.env.REACT_APP_AUTH_TOKEN || 'dev-token';
    config.headers.Authorization = `Bearer ${devToken}`;
  }
  
  return config;
}, error => {
  return Promise.reject(error);
});

// Function API calls
export const functionService = {
  // Get all functions
  listFunctions: async () => {
    try {
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.get(`${API_URL}/function/list`);
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
        timeout: 30000, // 30 second timeout for cold starts
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
      const token = localStorage.getItem('token') || process.env.REACT_APP_AUTH_TOKEN || 'dev-token';
      const response = await axios({
        method: 'GET',
        url: `${BUILDER_URL}/get-function-code/${name}`,
        responseType: 'blob',
        headers: {
          'Authorization': `Bearer ${token}`
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
      const token = localStorage.getItem('token') || process.env.REACT_APP_AUTH_TOKEN || 'dev-token';
      const response = await axios.post(`${BUILDER_URL}/build`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
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
      // Use the API Gateway as a proxy to ensure user ID is passed correctly
      await api.post(`${API_URL}/function/register`, {
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
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.post(`${API_URL}/function/start/${name}`);
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
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.post(`${API_URL}/function/stop/${name}`);
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
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.delete(`${API_URL}/function/delete/${name}`);
      console.debug(`Delete function ${name} response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error deleting function ${name}:`, error);
      throw error;
    }
  },
  
  // Get function logs
  getFunctionLogs: async (name, lines = 100) => {
    try {
      console.debug(`Getting logs for function ${name} (${lines} lines)`);
      // Use the JSON logs endpoint for more reliable parsing
      const url = `${CONTROLLER_URL}/logs-json/${name}?lines=${lines}`;
      console.debug('Logs request URL:', url);
      
      const response = await api.get(url, {
        timeout: 10000 // 10 second timeout for logs
      });
      
      console.debug(`Logs response status: ${response.status}, content type: ${response.headers['content-type']}`);
      console.debug('Logs response data:', response.data);
      
      // The JSON endpoint returns a structured response
      if (response.data && response.data.logs !== undefined) {
        return response.data.logs;
      } else if (response.data && response.data.message) {
        return response.data.message;
      } else {
        console.warn('Unexpected logs response format:', response.data);
        return 'Logs format error. Please check console for details.';
      }
    } catch (error) {
      console.error(`Error getting logs for function ${name}:`, error);
      if (error.response && error.response.status === 400) {
        // Function is not running
        return 'Function is not running. Start the function to view logs.';
      } else if (error.message) {
        return `Error fetching logs: ${error.message}`;
      }
      return 'Failed to fetch logs. Please check the console for details.';
    }
  }
};

export default api;
