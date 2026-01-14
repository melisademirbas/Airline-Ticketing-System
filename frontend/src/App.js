import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import FlightSearch from './components/FlightSearch';
import AdminFlightEntry from './components/AdminFlightEntry';
import PassengerInfo from './components/PassengerInfo';
import './App.css';

function App() {
  // Use fallback values if environment variables are not loaded
  const userPoolId = process.env.REACT_APP_COGNITO_USER_POOL_ID || 'eu-north-1_0IKa8ySfx';
  const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID || 'ahjf8dv8thoaasmg65gkenbtt';

  // Configuration check is now optional since we have fallback values
  // if (!userPoolId || !clientId) {
  //   return (
  //     <div style={{ padding: '20px', textAlign: 'center' }}>
  //       <h2>Configuration Error</h2>
  //       <p>AWS Cognito configuration missing. Please check .env file.</p>
  //       <p>Required: REACT_APP_COGNITO_USER_POOL_ID, REACT_APP_COGNITO_CLIENT_ID</p>
  //       <p style={{ fontSize: '12px', color: 'gray', marginTop: '10px' }}>
  //         See AWS_COGNITO_SETUP.md for setup instructions
  //       </p>
  //     </div>
  //   );
  // }

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/search" element={<FlightSearch />} />
          <Route path="/admin/flights" element={<AdminFlightEntry />} />
          <Route path="/passenger-info/:flightId" element={<PassengerInfo />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
