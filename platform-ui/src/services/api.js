import axios from 'axios';
import { decodeToken } from '../utils/tokenUtils';

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
      // Get user info from token
      let userId = 'admin';
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Send the user ID in the header instead of the URL path
      const headers = { 'X-User-ID': userId };
      const response = await api.get(`${API_URL}/function/list`, { headers });
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Use the composite key format that includes user ID
      const fullFunctionName = `${userId}-${name}`;
      console.debug(`Getting function with composite key: ${fullFunctionName}`);
      
      // For MVP, we'll use the list endpoint and filter for the specific function
      const response = await api.get(`${API_URL}/list`);
      return response.data[fullFunctionName] || null;
    } catch (error) {
      console.error(`Error getting function ${name}:`, error);
      throw error;
    }
  },
  
  // Invoke a function
  invokeFunction: async (name, method = 'GET', data = {}, endpoint = '') => {
    try {
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Invoking function with composite key: ${fullFunctionName}`);
      
      console.debug(`Invoking function ${name} with method ${method} at endpoint ${endpoint}:`, data);
      
      // Prepare the URL with the endpoint if provided
      const functionUrl = endpoint 
        ? `${API_URL}/function/${fullFunctionName}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
        : `${API_URL}/function/${fullFunctionName}`;
      
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Use the composite key format that includes user ID
      const fullFunctionName = `${userId}-${name}`;
      console.debug(`Getting code for function with composite key: ${fullFunctionName}`);
      
      // Use axios to get the file with responseType blob
      // Reuse the token we already have
      const response = await axios({
        method: 'GET',
        url: `${BUILDER_URL}/get-function-code/${fullFunctionName}`,
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Use the composite key format that includes user ID
      const fullFunctionName = `${userId}-${name}`;
      console.debug(`Deploying function with composite key: ${fullFunctionName}`);
      
      const formData = new FormData();
      formData.append('file', fileData);
      formData.append('name', fullFunctionName);
      
      // Use different headers for file upload
      // Reuse the token we already have
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
          name: fullFunctionName,
          endpoint: `http://function-controller:8081`
        });
      }
      
      // Always register with Function Controller to update the image
      // Use the API Gateway as a proxy to ensure user ID is passed correctly
      await api.post(`${API_URL}/function/register`, {
        name: fullFunctionName,
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Starting function with composite key: ${fullFunctionName}`);
      
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.post(`${API_URL}/function/start/${fullFunctionName}`);
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Stopping function with composite key: ${fullFunctionName}`);
      
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.post(`${API_URL}/function/stop/${fullFunctionName}`);
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Getting status for function with composite key: ${fullFunctionName}`);
      
      // Use the list endpoint instead of status endpoint to avoid CORS issues
      const response = await api.get(`${CONTROLLER_URL}/list`);
      console.debug(`Got function list to check status for ${fullFunctionName}:`, response.data);
      
      // Find the function in the list
      if (response.data && response.data[fullFunctionName]) {
        return response.data[fullFunctionName];
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Deleting function with composite key: ${fullFunctionName}`);
      
      // Route through API Gateway to ensure user ID is passed correctly
      const response = await api.delete(`${API_URL}/function/delete/${fullFunctionName}`);
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
      // Get user info from token
      const token = localStorage.getItem('token');
      let userId = 'admin'; // Default for backward compatibility
      
      if (token && token !== 'dev-token') {
        try {
          // Decode JWT to get user ID
          const decoded = decodeToken(token);
          userId = decoded.id || decoded.sub || decoded.user_id || 'admin';
        } catch (e) {
          console.warn('Could not decode token, using default user ID:', e);
        }
      }
      
      // Extract the base function name, removing any user ID prefix
      console.debug(`Function name: ${name}, userId: ${userId}`);
      
      // Check if the name already contains a user ID prefix
      const parts = name.split('-');
      const baseName = parts.length > 1 && parts[0].startsWith('user_') ? parts.slice(1).join('-') : name;
      
      console.debug(`Base function name: ${baseName}`);
      
      // Use the base name with the current user ID
      const fullFunctionName = `${userId}-${baseName}`;
      console.debug(`Getting logs for function with composite key: ${fullFunctionName} (${lines} lines)`);
      
      // Use the JSON logs endpoint for more reliable parsing
      // Note: The logs endpoint still uses the simple name, not the composite key
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
