import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
apiClient.interceptors.request.use(
  (config) => {
    // Try to use ID token first (has groups info), fallback to access token
    const idToken = localStorage.getItem('idToken');
    const accessToken = localStorage.getItem('token');
    const token = idToken || accessToken;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 Using token:', idToken ? 'ID token' : 'Access token');
    } else {
      console.warn('⚠️ No token found in localStorage');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors (unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      console.error('❌ 401 Unauthorized - Token expired or invalid');
      // Don't redirect immediately - let the component handle it
      // This allows components to show error messages before redirecting
      const token = localStorage.getItem('token');
      if (!token) {
        // No token at all - redirect immediately
        localStorage.clear();
        window.location.href = '/login';
      }
      // Otherwise, let the component handle the error and show a message
    }
    return Promise.reject(error);
  }
);

export default apiClient;
