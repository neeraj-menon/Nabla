import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8084';

export const loginUser = async (username, password) => {
  const res = await axios.post(`${API_URL}/auth/login`, { username, password });
  return res.data.token;
};

export const registerUser = async (username, email, password) => {
  const res = await axios.post(`${API_URL}/auth/register`, { username, email, password });
  return res.data;
};
