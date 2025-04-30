import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { loginUser, registerUser } from '../services/auth';
import './Login.css';

export default function Login() {
  const { login } = useContext(AuthContext);
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    try {
      if (isLogin) {
        // Login flow
        const token = await loginUser(form.username, form.password);
        login(token);
        navigate('/dashboard');
      } else {
        // Signup flow
        if (!form.email) {
          setError('Email is required');
          return;
        }
        if (form.password.length < 8) {
          setError('Password must be at least 8 characters long');
          return;
        }
        
        await registerUser(form.username, form.email, form.password);
        setSuccessMessage('Registration successful! You can now login.');
        setIsLogin(true);
        setForm({ ...form, password: '' });
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError(isLogin ? 'Invalid credentials' : 'Registration failed');
      }
    }
  };
  
  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setSuccessMessage('');
    setForm({ username: '', email: '', password: '' });
  };

  return (
    <div className="login-container">
      <h2>{isLogin ? 'Login to Platform' : 'Create an Account'}</h2>
      {error && <p className="error">{error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}
      
      <form onSubmit={handleSubmit}>
        <input 
          type="text" 
          placeholder="Username" 
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} 
          required 
        />
        
        {!isLogin && (
          <input 
            type="email" 
            placeholder="Email" 
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} 
            required 
          />
        )}
        
        <input 
          type="password" 
          placeholder="Password" 
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} 
          required 
        />
        
        <button type="submit">
          {isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>
      
      <p className="auth-toggle">
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <button 
          type="button" 
          className="toggle-btn" 
          onClick={toggleAuthMode}
        >
          {isLogin ? 'Sign Up' : 'Login'}
        </button>
      </p>
    </div>
  );
}
