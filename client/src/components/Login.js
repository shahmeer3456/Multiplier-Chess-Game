import React, { useState } from 'react';
import { Form, Button, Tabs, Tab, Alert } from 'react-bootstrap';
import { FaUser, FaLock, FaChessKing, FaChessQueen, FaUserPlus, FaSignInAlt } from 'react-icons/fa';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeTab, setActiveTab] = useState('login');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      onLogin(username, password, false);
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    
    // Validate form
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Clear any previous errors
    setError('');
    
    // Call the login handler with registration flag
    onLogin(username, password, true);
  };

  return (
    <div className="login-container">
      <div className="d-flex align-items-center justify-content-center mb-4">
        <FaChessKing size={42} className="me-3 text-primary" />
        <h2 className="login-title mb-0">Multiplayer Chess</h2>
      </div>
      
      <Tabs
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key)}
        className="mb-4"
      >
        <Tab eventKey="login" title={<span><FaSignInAlt className="me-2" />Login</span>}>
          <p className="text-center text-muted mb-4">Sign in with your account to play or spectate games</p>
          
          <Form className="login-form" onSubmit={handleLogin}>
            <Form.Group className="mb-3">
              <div className="input-group">
                <span className="input-group-text"><FaUser /></span>
                <Form.Control
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </Form.Group>
            
            <Form.Group className="mb-4">
              <div className="input-group">
                <span className="input-group-text"><FaLock /></span>
                <Form.Control
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </Form.Group>
            
            <div className="d-grid">
              <Button variant="primary" type="submit" size="lg" disabled={!username.trim() || !password.trim()}>
                Login
              </Button>
            </div>
            
            <div className="register-option">
              Don't have an account? <Button variant="link" className="p-0" onClick={() => setActiveTab('register')}>Register</Button>
            </div>
          </Form>
        </Tab>
        
        <Tab eventKey="register" title={<span><FaUserPlus className="me-2" />Register</span>}>
          <p className="text-center text-muted mb-4">Create a new account to track your games and statistics</p>
          
          {error && (
            <Alert variant="danger" className="mb-3">
              <FaLock className="me-2" />{error}
            </Alert>
          )}
          
          <Form className="login-form" onSubmit={handleRegister}>
            <Form.Group className="mb-3">
              <div className="input-group">
                <span className="input-group-text"><FaUser /></span>
                <Form.Control
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <div className="input-group">
                <span className="input-group-text"><FaLock /></span>
                <Form.Control
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </Form.Group>
            
            <Form.Group className="mb-4">
              <div className="input-group">
                <span className="input-group-text"><FaLock /></span>
                <Form.Control
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </Form.Group>
            
            <div className="d-grid">
              <Button variant="success" type="submit" size="lg">
                Create Account
              </Button>
            </div>
            
            <div className="register-option">
              Already have an account? <Button variant="link" className="p-0" onClick={() => setActiveTab('login')}>Login</Button>
            </div>
          </Form>
        </Tab>
        
        <Tab eventKey="guest" title={<span><FaChessQueen className="me-2" />Play as Guest</span>}>
          <p className="text-center text-muted mb-4">Play without an account. Your games won't be saved.</p>
          
          <Form className="login-form" onSubmit={(e) => { e.preventDefault(); onLogin(username, '', false); }}>
            <Form.Group className="mb-4">
              <div className="input-group">
                <span className="input-group-text"><FaUser /></span>
                <Form.Control
                  type="text"
                  placeholder="Enter a temporary username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </Form.Group>
            
            <div className="d-grid">
              <Button variant="outline-primary" type="submit" size="lg" disabled={!username.trim()}>
                Join as Guest
              </Button>
            </div>
            
            <div className="register-option">
              Want to save your games? <Button variant="link" className="p-0" onClick={() => setActiveTab('register')}>Create an Account</Button>
            </div>
          </Form>
        </Tab>
      </Tabs>
    </div>
  );
}

export default Login; 