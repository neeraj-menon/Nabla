import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  return user ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;
