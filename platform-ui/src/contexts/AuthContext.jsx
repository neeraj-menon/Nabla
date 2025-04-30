import React, { createContext, useState, useEffect } from 'react';
import { getToken, setToken, removeToken } from '../utils/tokenUtils';
import { decodeToken } from 'react-jwt';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const decoded = decodeToken(token);
      setUser({ token, ...decoded });
    }
  }, []);

  const login = (token) => {
    setToken(token);
    const decoded = decodeToken(token);
    setUser({ token, ...decoded });
  };

  const logout = () => {
    removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
