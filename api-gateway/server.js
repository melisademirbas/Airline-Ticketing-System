const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Service URLs
const FLIGHT_SERVICE_URL = process.env.FLIGHT_SERVICE_URL || 'http://localhost:3002';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:3004';

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// IAM Authentication middleware - Auth0
const { authenticate, authenticateAdmin } = require('./auth');

// Version handling middleware
const versionHandler = (req, res, next) => {
  const version = req.headers['api-version'] || 'v1';
  req.apiVersion = version;
  next();
};

app.use('/api/', versionHandler);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Flight Service Routes
app.post('/api/v1/flights', authenticateAdmin, async (req, res) => {
  try {
    console.log('📥 Forwarding flight creation request to Flight Service...');
    const response = await axios.post(`${FLIGHT_SERVICE_URL}/api/v1/flights`, req.body, {
      headers: { 'Authorization': req.headers.authorization }
    });
    console.log('✅ Flight created successfully via Flight Service');
    res.json(response.data);
  } catch (error) {
    console.error('❌ Error forwarding request to Flight Service:', error.message);
    console.error('Error details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message || 'Internal server error' 
    });
  }
});

app.get('/api/v1/flights/search', async (req, res) => {
  try {
    console.log('🔍 API Gateway: Forwarding search request to Flight Service...');
    console.log('Request params:', req.query);
    const response = await axios.get(`${FLIGHT_SERVICE_URL}/api/v1/flights/search`, {
      params: req.query
    });
    console.log('✅ API Gateway: Search successful, returning results');
    res.json(response.data);
  } catch (error) {
    console.error('❌ API Gateway: Error forwarding search request:', error.message);
    console.error('Error details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message || 'Internal server error' 
    });
  }
});

app.get('/api/v1/flights/:id', async (req, res) => {
  try {
    const response = await axios.get(`${FLIGHT_SERVICE_URL}/api/v1/flights/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

app.post('/api/v1/flights/:flightId/book', authenticate, async (req, res) => {
  try {
    const response = await axios.post(
      `${FLIGHT_SERVICE_URL}/api/v1/flights/${req.params.flightId}/book`,
      { ...req.body, userId: req.user.id },
      { headers: { 'Authorization': req.headers.authorization } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Miles&Smiles Routes
app.get('/api/v1/miles/member/:memberNumber', authenticate, async (req, res) => {
  try {
    const response = await axios.get(
      `${FLIGHT_SERVICE_URL}/api/v1/miles/member/${req.params.memberNumber}`
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

app.get('/api/v1/miles/member-by-user/:userId', authenticate, async (req, res) => {
  try {
    const response = await axios.get(
      `${FLIGHT_SERVICE_URL}/api/v1/miles/member-by-user/${req.params.userId}`
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

app.post('/api/v1/miles/add', authenticate, async (req, res) => {
  try {
    const response = await axios.post(
      `${FLIGHT_SERVICE_URL}/api/v1/miles/add`,
      req.body,
      { headers: { 'Authorization': req.headers.authorization } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Price Prediction Route
app.post('/api/v1/flights/predict-price', async (req, res) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/v1/predict`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Notification Service Routes (for external airlines)
// Note: This route does NOT use authenticate middleware - it uses API key authentication instead
app.post('/api/v1/miles/add-external', async (req, res) => {
  try {
    console.log('📥 API Gateway: Forwarding external miles request to Notification Service...');
    // Forward API key from header or use configured key
    const apiKey = req.headers['x-api-key'] || process.env.EXTERNAL_AIRLINE_API_KEY;
    
    const response = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/v1/miles/add-external`,
      req.body,
      { 
        headers: { 
          'x-api-key': apiKey
        } 
      }
    );
    console.log('✅ API Gateway: External miles request successful');
    res.json(response.data);
  } catch (error) {
    console.error('❌ API Gateway: Error forwarding external miles request:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message || 'Internal server error' 
    });
  }
});

// Airport and Airline Cache Routes
app.get('/api/v1/airports', async (req, res) => {
  try {
    console.log('📥 API Gateway: Forwarding airports request to Flight Service...');
    const response = await axios.get(`${FLIGHT_SERVICE_URL}/api/v1/airports`);
    console.log('✅ API Gateway: Airports request successful');
    res.json(response.data);
  } catch (error) {
    console.error('❌ API Gateway: Error forwarding airports request:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message || 'Internal server error' 
    });
  }
});

app.get('/api/v1/airlines', async (req, res) => {
  try {
    console.log('📥 API Gateway: Forwarding airlines request to Flight Service...');
    const response = await axios.get(`${FLIGHT_SERVICE_URL}/api/v1/airlines`);
    console.log('✅ API Gateway: Airlines request successful');
    res.json(response.data);
  } catch (error) {
    console.error('❌ API Gateway: Error forwarding airlines request:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message || 'Internal server error' 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
