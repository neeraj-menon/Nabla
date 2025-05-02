export const getToken = () => localStorage.getItem('token');
export const setToken = (token) => localStorage.setItem('token', token);
export const removeToken = () => localStorage.removeItem('token');

/**
 * Decode a JWT token to get its payload
 * @param {string} token - JWT token to decode
 * @returns {object} - Decoded token payload
 */
export const decodeToken = (token) => {
  try {
    // JWT tokens are in format: header.payload.signature
    // Split by dot and get the payload (second part)
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};
    
    // Convert base64url to base64
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode base64 string and parse JSON
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return {};
  }
};
