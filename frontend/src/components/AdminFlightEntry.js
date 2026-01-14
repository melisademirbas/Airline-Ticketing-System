import React, { useState, useEffect } from 'react';
import apiClient from '../utils/api';
import './AdminFlightEntry.css';

// Cities from dataset
const CITIES = ['Bangalore', 'Chennai', 'Delhi', 'Hyderabad', 'Kolkata', 'Mumbai'];

function AdminFlightEntry() {
  const [formData, setFormData] = useState({
    flight_code: '',
    from_city: '',
    to_city: '',
    flight_date: '',
    duration: '',
    price: '',
    capacity: ''
  });
  const [predictedPrice, setPredictedPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (role !== 'ADMIN') {
      window.location.href = '/login';
    }
  }, []);

  const validateDuration = (duration) => {
    // Format: Xh Ym or Xh or Ym
    const pattern = /^(\d+h\s*)?(\d+m)?$/i;
    return pattern.test(duration.trim());
  };

  const validateFlightCode = (code) => {
    // Format: XX123 or XXX123 (2-3 letters + numbers)
    const pattern = /^[A-Z]{2,3}\d{1,4}$/i;
    return pattern.test(code.trim());
  };

  const validateDate = (date) => {
    if (!date) return false;
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate >= today;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Real-time validation
    if (name === 'duration' && value) {
      if (!validateDuration(value)) {
        setErrors(prev => ({
          ...prev,
          duration: 'Format: 2h 30m or 2h or 30m'
        }));
      }
    }

    if (name === 'flight_code' && value) {
      if (!validateFlightCode(value)) {
        setErrors(prev => ({
          ...prev,
          flight_code: 'Format: XX123 (2-3 letters + numbers)'
        }));
      }
    }

    if (name === 'flight_date' && value) {
      if (!validateDate(value)) {
        setErrors(prev => ({
          ...prev,
          flight_date: 'Date must be today or later'
        }));
      }
    }

    if (name === 'from_city' && value === formData.to_city) {
      setErrors(prev => ({
        ...prev,
        from_city: 'Departure and destination cannot be the same'
      }));
    }

    if (name === 'to_city' && value === formData.from_city) {
      setErrors(prev => ({
        ...prev,
        to_city: 'Departure and destination cannot be the same'
      }));
    }

    if (name === 'capacity' && value) {
      const capacity = parseInt(value);
      if (isNaN(capacity) || capacity < 1 || capacity > 1000) {
        setErrors(prev => ({
          ...prev,
          capacity: 'Capacity must be between 1 and 1000'
        }));
      }
    }

    if (name === 'price' && value) {
      const price = parseFloat(value);
      if (isNaN(price) || price < 0) {
        setErrors(prev => ({
          ...prev,
          price: 'Price must be a positive number'
        }));
      }
    }
  };

  const handlePredictPrice = async () => {
    // Validate required fields
    const validationErrors = {};
    
    if (!formData.duration) {
      validationErrors.duration = 'Duration is required for prediction';
    } else if (!validateDuration(formData.duration)) {
      validationErrors.duration = 'Invalid duration format. Use: 2h 30m';
    }

    if (!formData.from_city) {
      validationErrors.from_city = 'Departure city is required';
    }

    if (!formData.to_city) {
      validationErrors.to_city = 'Destination city is required';
    }

    if (formData.from_city === formData.to_city) {
      validationErrors.from_city = 'Departure and destination cannot be the same';
      validationErrors.to_city = 'Departure and destination cannot be the same';
    }

    if (!formData.flight_date) {
      validationErrors.flight_date = 'Flight date is required';
    } else if (!validateDate(formData.flight_date)) {
      validationErrors.flight_date = 'Date must be today or later';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setPredicting(true);
    setErrors({});

    try {
      const response = await apiClient.post('/api/v1/flights/predict-price', {
        duration: formData.duration,
        from_city: formData.from_city,
        to_city: formData.to_city,
        flight_date: formData.flight_date
      });
      const predictedPrice = Math.round(response.data.predicted_price);
      setPredictedPrice(predictedPrice);
      setFormData(prev => ({ ...prev, price: predictedPrice }));
      setMessage('');
      setErrors({}); // Clear any previous errors
    } catch (error) {
      setErrors({ predict: error.response?.data?.error || 'Error predicting price. Please check your inputs.' });
      console.error('Error predicting price:', error);
    } finally {
      setPredicting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields
    const validationErrors = {};

    if (!formData.flight_code || !validateFlightCode(formData.flight_code)) {
      validationErrors.flight_code = 'Invalid flight code format. Use: XX123';
    }

    if (!formData.from_city) {
      validationErrors.from_city = 'Departure city is required';
    }

    if (!formData.to_city) {
      validationErrors.to_city = 'Destination city is required';
    }

    if (formData.from_city === formData.to_city) {
      validationErrors.from_city = 'Departure and destination cannot be the same';
      validationErrors.to_city = 'Departure and destination cannot be the same';
    }

    if (!formData.flight_date || !validateDate(formData.flight_date)) {
      validationErrors.flight_date = 'Valid future date is required';
    }

    if (!formData.duration || !validateDuration(formData.duration)) {
      validationErrors.duration = 'Invalid duration format. Use: 2h 30m';
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      validationErrors.price = 'Valid price is required';
    }

    if (!formData.capacity || parseInt(formData.capacity) < 1 || parseInt(formData.capacity) > 1000) {
      validationErrors.capacity = 'Capacity must be between 1 and 1000';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setMessage('');
      return;
    }

    setLoading(true);
    setMessage('');
    setErrors({});

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage('Error: You are not authenticated. Please login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      const response = await apiClient.post('/api/v1/flights', formData);
      setMessage('✅ Flight added successfully!');
      setFormData({
        flight_code: '',
        from_city: '',
        to_city: '',
        flight_date: '',
        duration: '',
        price: '',
        capacity: ''
      });
      setPredictedPrice(null);
      setErrors({});
    } catch (error) {
      console.error('Error adding flight:', error);
      if (error.response?.status === 401) {
        setMessage('❌ Authentication failed. Please login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (error.response?.status === 403) {
        setMessage('❌ Access denied. Admin role required.');
      } else {
        setMessage('❌ Error: ' + (error.response?.data?.error || error.message || 'Error adding flight'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="header">
        <div className="header-content">
          <div className="logo">Turkish Airlines - Admin</div>
          <div className="nav">
            <a href="/admin/flights">Add Flights</a>
            <a href="/login" onClick={() => localStorage.clear()}>Logout</a>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="admin-card">
          <h2>✈️ Flight Entry</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>From City *</label>
                <select
                  name="from_city"
                  value={formData.from_city}
                  onChange={handleInputChange}
                  className={errors.from_city ? 'error-input' : ''}
                  required
                >
                  <option value="">Select departure city</option>
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
                {errors.from_city && <div className="error">{errors.from_city}</div>}
              </div>

              <div className="form-group">
                <label>To City *</label>
                <select
                  name="to_city"
                  value={formData.to_city}
                  onChange={handleInputChange}
                  className={errors.to_city ? 'error-input' : ''}
                  required
                >
                  <option value="">Select destination city</option>
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
                {errors.to_city && <div className="error">{errors.to_city}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Flight Date *</label>
                <input
                  type="date"
                  name="flight_date"
                  value={formData.flight_date}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className={errors.flight_date ? 'error-input' : ''}
                  required
                />
                {errors.flight_date && <div className="error">{errors.flight_date}</div>}
              </div>

              <div className="form-group">
                <label>Flight Code *</label>
                <input
                  type="text"
                  name="flight_code"
                  placeholder="e.g., TK123"
                  value={formData.flight_code}
                  onChange={handleInputChange}
                  className={errors.flight_code ? 'error-input' : ''}
                  required
                />
                {errors.flight_code && <div className="error">{errors.flight_code}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Duration *</label>
                <input
                  type="text"
                  name="duration"
                  placeholder="e.g., 2h 30m or 2h or 30m"
                  value={formData.duration}
                  onChange={handleInputChange}
                  className={errors.duration ? 'error-input' : ''}
                  required
                />
                {errors.duration && <div className="error">{errors.duration}</div>}
                <small className="help-text">Format: 2h 30m, 2h, or 30m</small>
              </div>

              <div className="form-group">
                <label>Price *</label>
                <div className="price-input-group">
                  <input
                    type="number"
                    name="price"
                    placeholder="Click Predict to get price"
                    value={formData.price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className={errors.price ? 'error-input' : ''}
                    required
                    readOnly={!!predictedPrice}
                    style={predictedPrice ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handlePredictPrice}
                    disabled={predicting}
                  >
                    {predicting ? 'Predicting...' : 'Predict'}
                  </button>
                </div>
                {errors.price && <div className="error">{errors.price}</div>}
                {errors.predict && <div className="error">{errors.predict}</div>}
                {predictedPrice && !errors.predict && (
                  <div className="success">
                    ✓ Predicted price: ${predictedPrice} 
                    {formData.price && formData.price != predictedPrice && (
                      <span style={{marginLeft: '10px', fontSize: '12px'}}>
                        (You can edit if needed)
                      </span>
                    )}
                  </div>
                )}
                {!predictedPrice && (
                  <small className="help-text">Fill in duration, cities, and date, then click Predict</small>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Capacity *</label>
              <input
                type="number"
                name="capacity"
                placeholder="e.g., 180"
                value={formData.capacity}
                onChange={handleInputChange}
                required
                min="1"
                max="1000"
                className={errors.capacity ? 'error-input' : ''}
              />
              {errors.capacity && <div className="error">{errors.capacity}</div>}
            </div>

            {message && (
              <div className={message.includes('success') ? 'success' : 'error'}>
                {message}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Saving...' : 'SAVE'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminFlightEntry;
