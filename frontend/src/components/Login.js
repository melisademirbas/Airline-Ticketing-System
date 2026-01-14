import React, { useState } from 'react';
import { signIn } from '../utils/cognito';
import './Login.css';

function Login() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [cognitoUserForPasswordChange, setCognitoUserForPasswordChange] = useState(null);
  const [userAttributes, setUserAttributes] = useState(null);


  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      console.log('🔐 Direct login with email:', email);
      const result = await signIn(email, password);
      
      console.log('✅ Login successful!');
      
      // Save tokens and user info
      localStorage.setItem('token', result.accessToken);
      localStorage.setItem('idToken', result.idToken);
      localStorage.setItem('user', JSON.stringify(result.user));
      
      // Determine role from groups
      const groups = result.user.groups || [];
      const role = groups.includes('Admin') ? 'ADMIN' : 'USER';
      localStorage.setItem('role', role);
      
      // Redirect based on role
      if (role === 'ADMIN') {
        window.location.replace('/admin/flights');
      } else {
        window.location.replace('/search');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      
      // Check if new password is required
      if (err.code === 'NewPasswordRequired') {
        setNeedsNewPassword(true);
        setCognitoUserForPasswordChange(err.cognitoUser);
        setUserAttributes(err.userAttributes);
        setProcessing(false);
        setError('');
        return;
      }
      
      setError(err.message || 'Login failed. Please check your credentials.');
      setProcessing(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      setError('Please enter new password and confirmation');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      // Remove email from userAttributes as it cannot be modified
      const attributesToUpdate = { ...userAttributes };
      delete attributesToUpdate.email;
      
      // Complete new password challenge
      cognitoUserForPasswordChange.completeNewPasswordChallenge(
        newPassword,
        attributesToUpdate,
        {
          onSuccess: (result) => {
            console.log('✅ Password changed successfully!');
            
            const accessToken = result.getAccessToken().getJwtToken();
            const idToken = result.getIdToken().getJwtToken();
            
            // Decode ID token
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            
            // Save tokens and user info
            localStorage.setItem('token', accessToken);
            localStorage.setItem('idToken', idToken);
            localStorage.setItem('user', JSON.stringify({
              email: payload.email,
              name: payload.name || payload['cognito:username'],
              sub: payload.sub,
              groups: payload['cognito:groups'] || []
            }));
            
            // Determine role
            const groups = payload['cognito:groups'] || [];
            const role = groups.includes('Admin') ? 'ADMIN' : 'USER';
            localStorage.setItem('role', role);
            
            // Redirect based on role
            if (role === 'ADMIN') {
              window.location.replace('/admin/flights');
            } else {
              window.location.replace('/search');
            }
          },
          onFailure: (err) => {
            console.error('❌ Password change error:', err);
            setError(err.message || 'Failed to set new password');
            setProcessing(false);
          }
        }
      );
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to set new password');
      setProcessing(false);
    }
  };

  if (processing) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Loading...</h2>
          <p>Processing authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Error</h2>
          <p style={{ color: 'red' }}>{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary btn-block">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Login</h2>
        
        {needsNewPassword ? (
            /* New Password Form */
            <form onSubmit={handleNewPassword}>
              <div style={{ marginBottom: '15px' }}>
                <p style={{ color: '#856404', marginBottom: '15px' }}>
                  This is your first login. Please set a new password.
                </p>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    fontSize: '14px'
                  }}
                />
              </div>
              {error && (
                <div style={{ 
                  marginBottom: '15px', 
                  padding: '10px', 
                  backgroundColor: '#f8d7da', 
                  color: '#721c24',
                  borderRadius: '5px',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}
              <button 
                type="submit" 
                className="btn btn-primary btn-block"
                disabled={processing}
              >
                {processing ? 'Setting password...' : 'SET NEW PASSWORD'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNeedsNewPassword(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Back to Login
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '5px',
                    fontSize: '14px'
                  }}
                />
              </div>
              {error && (
                <div style={{ 
                  marginBottom: '15px', 
                  padding: '10px', 
                  backgroundColor: '#f8d7da', 
                  color: '#721c24',
                  borderRadius: '5px',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}
              <button 
                type="submit" 
                className="btn btn-primary btn-block"
                disabled={processing}
              >
                {processing ? 'Logging in...' : 'LOGIN'}
              </button>
            </form>
          )}
      </div>
    </div>
  );
}

export default Login;
