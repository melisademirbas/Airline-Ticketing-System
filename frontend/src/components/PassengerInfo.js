import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';
import './PassengerInfo.css';

function PassengerInfo() {
  const { flightId } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(null);
  const [formData, setFormData] = useState({
    passenger_name: '',
    passenger_surname: '',
    passenger_dob: '',
    title: 'Mr',
    miles_smiles_number: '',
    email: '',
    use_points: false,
    become_member: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [memberInfo, setMemberInfo] = useState(null);
  const [showMemberLogin, setShowMemberLogin] = useState(false);
  const [memberLoginNumber, setMemberLoginNumber] = useState('');
  const [memberLoginLoading, setMemberLoginLoading] = useState(false);

  useEffect(() => {
    const fetchFlight = async () => {
      try {
        const response = await apiClient.get(`/api/v1/flights/${flightId}`);
        setFlight(response.data);
      } catch (err) {
        setError('Flight not found');
      }
    };
    fetchFlight();
    
    // Check if user has Miles&Smiles membership
    const checkMemberStatus = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = user.id || user.sub || user.username;
        if (userId) {
          const response = await apiClient.get(`/api/v1/miles/member-by-user/${userId}`);
          setMemberInfo(response.data);
          // Auto-fill form with member info
          setFormData(prev => ({
            ...prev,
            miles_smiles_number: response.data.member_number,
            passenger_name: response.data.first_name,
            passenger_surname: response.data.last_name,
            passenger_dob: response.data.date_of_birth ? response.data.date_of_birth.split('T')[0] : '',
            email: response.data.email
          }));
        }
      } catch (err) {
        // User is not a member, that's okay
        console.log('User is not a Miles&Smiles member');
      }
    };
    checkMemberStatus();
  }, [flightId]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      const bookingData = {
        userId: user.id || user.sub || user.username || 'guest',
        passenger_name: formData.passenger_name,
        passenger_surname: formData.passenger_surname,
        passenger_dob: formData.passenger_dob,
        miles_smiles_number: formData.miles_smiles_number || null,
        email: formData.email,
        use_points: formData.use_points && formData.miles_smiles_number
      };

      if (formData.become_member && !formData.miles_smiles_number) {
        bookingData.become_member = true;
      }

      const response = await apiClient.post(
        `/api/v1/flights/${flightId}/book`,
        bookingData
      );

      // Show member number if new member was created
      if (response.data.is_new_member && response.data.member_number) {
        alert(`Ticket booked successfully!\n\n🎉 Welcome to Miles&Smiles!\nYour Member Number: ${response.data.member_number}\n\nPlease save this number for future bookings.`);
      } else if (response.data.member_number) {
        alert(`Ticket booked successfully!\n\nMiles&Smiles Member Number: ${response.data.member_number}`);
      } else {
        alert('Ticket booked successfully!');
      }
      
      navigate('/search');
    } catch (err) {
      setError(err.response?.data?.error || 'Error booking ticket');
    } finally {
      setLoading(false);
    }
  };

  if (!flight) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="passenger-info-container">
      <div className="header">
        <div className="header-content">
          <div className="logo">Turkish Airlines Miles&Smiles</div>
          <div className="nav">
            <a href="/search">Back to Search</a>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="info-box">
          <span>ℹ️</span> It is not possible to change the name and surname information after completing the reservation process.
        </div>

        <div className="passenger-card">
          <h2>Passenger information | Adult</h2>
          
          <div className="member-signin">
            <p>You can easily save passenger information by signing in to your Miles&Smiles account.</p>
            {!memberInfo ? (
              <>
                {!showMemberLogin ? (
                  <button 
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowMemberLogin(true)}
                  >
                    Sign in to Miles&Smiles
                  </button>
                ) : (
                  <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Miles&Smiles Member Number
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        value={memberLoginNumber}
                        onChange={(e) => setMemberLoginNumber(e.target.value)}
                        placeholder="Enter your member number"
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '5px'
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={async () => {
                          if (!memberLoginNumber) {
                            setError('Please enter member number');
                            return;
                          }
                          setMemberLoginLoading(true);
                          setError('');
                          try {
                            const response = await apiClient.get(`/api/v1/miles/member/${memberLoginNumber}`);
                            setMemberInfo(response.data);
                            setFormData(prev => ({
                              ...prev,
                              miles_smiles_number: response.data.member_number,
                              passenger_name: response.data.first_name,
                              passenger_surname: response.data.last_name,
                              passenger_dob: response.data.date_of_birth ? response.data.date_of_birth.split('T')[0] : '',
                              email: response.data.email
                            }));
                            setShowMemberLogin(false);
                          } catch (err) {
                            setError('Member not found. Please check your member number.');
                          } finally {
                            setMemberLoginLoading(false);
                          }
                        }}
                        disabled={memberLoginLoading}
                      >
                        {memberLoginLoading ? 'Loading...' : 'Load Info'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMemberLogin(false);
                          setMemberLoginNumber('');
                          setError('');
                        }}
                        style={{
                          padding: '8px 15px',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#d4edda', borderRadius: '5px', color: '#155724' }}>
                <strong>✓ Signed in as Miles&Smiles Member</strong>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                  Member Number: {memberInfo.member_number} | Points Balance: {memberInfo.points_balance} miles
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMemberInfo(null);
                    setFormData(prev => ({
                      ...prev,
                      miles_smiles_number: '',
                      passenger_name: '',
                      passenger_surname: '',
                      passenger_dob: '',
                      email: ''
                    }));
                  }}
                  style={{
                    marginTop: '10px',
                    padding: '5px 10px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Title</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="title"
                    value="Mr"
                    checked={formData.title === 'Mr'}
                    onChange={handleInputChange}
                  />
                  Mr.
                </label>
                <label>
                  <input
                    type="radio"
                    name="title"
                    value="Ms"
                    checked={formData.title === 'Ms'}
                    onChange={handleInputChange}
                  />
                  Ms.
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>First / Middle name (as shown on ID)</label>
              <input
                type="text"
                name="passenger_name"
                value={formData.passenger_name}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Surname (as shown on ID)</label>
              <input
                type="text"
                name="passenger_surname"
                value={formData.passenger_surname}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                name="passenger_dob"
                value={formData.passenger_dob}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Miles&Smiles Member Number (if applicable)</label>
              <input
                type="text"
                name="miles_smiles_number"
                value={formData.miles_smiles_number}
                onChange={handleInputChange}
                placeholder="Leave empty if not a member"
              />
            </div>

            {formData.miles_smiles_number && memberInfo && (
              <div className="form-group">
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: '#e7f3ff', 
                  borderRadius: '5px',
                  marginBottom: '10px'
                }}>
                  <strong>Available Points:</strong> {memberInfo.points_balance} miles
                  {memberInfo.points_balance >= flight.price && (
                    <span style={{ color: 'green', marginLeft: '10px' }}>
                      ✓ You have enough points for this flight
                    </span>
                  )}
                  {memberInfo.points_balance < flight.price && (
                    <span style={{ color: 'orange', marginLeft: '10px' }}>
                      ⚠ You need {Math.ceil(flight.price - memberInfo.points_balance)} more miles
                    </span>
                  )}
                </div>
                <label>
                  <input
                    type="checkbox"
                    name="use_points"
                    checked={formData.use_points}
                    onChange={handleInputChange}
                    disabled={memberInfo.points_balance < flight.price}
                  />
                  Use Miles&Smiles points for this purchase
                  {memberInfo.points_balance < flight.price && (
                    <span style={{ color: 'red', marginLeft: '10px' }}>
                      (Insufficient points)
                    </span>
                  )}
                </label>
              </div>
            )}

            {!formData.miles_smiles_number && (
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="become_member"
                    checked={formData.become_member}
                    onChange={handleInputChange}
                  />
                  I want to become a Miles&Smiles Member
                </label>
              </div>
            )}

            <div className="flight-summary">
              <h3>Flight Summary</h3>
              <p><strong>Route:</strong> {flight.from_city} → {flight.to_city}</p>
              <p><strong>Date:</strong> {flight.flight_date}</p>
              <p><strong>Duration:</strong> {flight.duration}</p>
              <p><strong>Price:</strong> ${flight.price}</p>
              {formData.use_points && memberInfo && (
                <p style={{ color: 'green', fontWeight: 'bold' }}>
                  <strong>Payment:</strong> {Math.floor(flight.price)} miles (Points)
                </p>
              )}
              {!formData.use_points && (
                <p><strong>Payment:</strong> ${flight.price} (Cash)</p>
              )}
            </div>

            {error && <div className="error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Processing...' : 'Complete Booking'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PassengerInfo;
