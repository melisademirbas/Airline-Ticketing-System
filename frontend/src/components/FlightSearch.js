import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/api';
import './FlightSearch.css';

function FlightSearch() {
  const [searchParams, setSearchParams] = useState({
    from: '',
    to: '',
    departure_date: '',
    return_date: '',
    passengers: 1,
    trip_type: 'round',
    flexible_dates: false,
    direct_only: false
  });
  const [flights, setFlights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const navigate = useNavigate();

  // Ensure user data exists for demo purposes
  useEffect(() => {
    if (!localStorage.getItem('user')) {
      localStorage.setItem('user', JSON.stringify({ email: 'demo@user.com' }));
      localStorage.setItem('role', 'USER');
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSearchParams(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSearch = async (e, page = 1) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const params = {
        from: searchParams.from,
        to: searchParams.to,
        departure_date: searchParams.departure_date,
        passengers: searchParams.passengers,
        page: page,
        limit: 10
      };

      if (searchParams.trip_type === 'round' && searchParams.return_date) {
        params.return_date = searchParams.return_date;
      }

      if (searchParams.flexible_dates) {
        params.flexible_dates = 'true';
      }

      if (searchParams.direct_only) {
        params.direct_only = 'true';
      }

      const response = await apiClient.get('/api/v1/flights/search', { params });
      
      // Handle pagination response
      if (response.data.data) {
        // Single trip with pagination
        setFlights(response.data.data);
        setPagination(response.data.pagination);
      } else if (response.data.outbound) {
        // Round trip with pagination
        setFlights({
          outbound: response.data.outbound.data,
          return: response.data.return.data
        });
        setPagination({
          outbound: response.data.outbound.pagination,
          return: response.data.return.pagination
        });
      } else {
        // Fallback for old response format (backward compatibility)
        setFlights(response.data);
        setPagination(null);
      }
      
      setCurrentPage(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Error searching flights');
    } finally {
      setLoading(false);
    }
  };

  const handleBook = (flight) => {
    navigate(`/passenger-info/${flight.id}`);
  };

  return (
    <div className="flight-search-container">
      <div className="header">
        <div className="header-content">
          <div className="logo">Turkish Airlines</div>
          <div className="nav">
            <a href="/search">Search Flights</a>
            <a href="/login" onClick={() => localStorage.clear()}>Logout</a>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="search-card">
          <h2>SEARCH FLIGHTS</h2>
          <form onSubmit={handleSearch}>
            <div className="trip-type">
              <label>
                <input
                  type="radio"
                  name="trip_type"
                  value="one"
                  checked={searchParams.trip_type === 'one'}
                  onChange={handleInputChange}
                />
                One way
              </label>
              <label>
                <input
                  type="radio"
                  name="trip_type"
                  value="round"
                  checked={searchParams.trip_type === 'round'}
                  onChange={handleInputChange}
                />
                Round trip
              </label>
            </div>

            <div className="search-fields">
              <div className="form-group">
                <label>From</label>
                <input
                  type="text"
                  name="from"
                  placeholder="Enter departure city"
                  value={searchParams.from}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>To</label>
                <input
                  type="text"
                  name="to"
                  placeholder="Enter destination city"
                  value={searchParams.to}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Departure Date</label>
                <input
                  type="date"
                  name="departure_date"
                  value={searchParams.departure_date}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {searchParams.trip_type === 'round' && (
                <div className="form-group">
                  <label>Return Date</label>
                  <input
                    type="date"
                    name="return_date"
                    value={searchParams.return_date}
                    onChange={handleInputChange}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Passengers</label>
                <input
                  type="number"
                  name="passengers"
                  min="1"
                  value={searchParams.passengers}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="options">
              <label>
                <input
                  type="checkbox"
                  name="flexible_dates"
                  checked={searchParams.flexible_dates}
                  onChange={handleInputChange}
                />
                Flexible dates
              </label>
              <label>
                <input
                  type="checkbox"
                  name="direct_only"
                  checked={searchParams.direct_only}
                  onChange={handleInputChange}
                />
                Direct flights only
              </label>
            </div>

            <button type="submit" className="btn btn-danger btn-search" disabled={loading}>
              {loading ? 'Searching...' : 'Search flights →'}
            </button>
          </form>
        </div>

        {error && <div className="error">{error}</div>}

        {flights && (
          <div className="results">
            <h3>Flight Results</h3>
            {Array.isArray(flights) ? (
              flights.length === 0 ? (
                <p>No flights found</p>
              ) : (
                <>
                  {flights.map(flight => (
                    <div key={flight.id} className="flight-card">
                      <div className="flight-info">
                        <div>
                          <strong>{flight.from_city}</strong> → <strong>{flight.to_city}</strong>
                        </div>
                        <div>Date: {flight.flight_date}</div>
                        <div>Duration: {flight.duration}</div>
                        <div>Price: ${flight.price}</div>
                        <div>Available seats: {flight.capacity - flight.booked_seats}</div>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleBook(flight)}
                      >
                        BUY TICKET
                      </button>
                    </div>
                  ))}
                  {pagination && (
                    <div className="pagination">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleSearch(null, currentPage - 1)}
                        disabled={currentPage === 1 || loading}
                      >
                        Previous
                      </button>
                      <span>Page {pagination.page} of {pagination.totalPages} (Total: {pagination.total})</span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleSearch(null, currentPage + 1)}
                        disabled={currentPage >= pagination.totalPages || loading}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )
            ) : (
              <>
                {flights.outbound && flights.outbound.length > 0 && (
                  <div>
                    <h4>Outbound Flights</h4>
                    {flights.outbound.map(flight => (
                      <div key={flight.id} className="flight-card">
                        <div className="flight-info">
                          <div>
                            <strong>{flight.from_city}</strong> → <strong>{flight.to_city}</strong>
                          </div>
                          <div>Date: {flight.flight_date}</div>
                          <div>Duration: {flight.duration}</div>
                          <div>Price: ${flight.price}</div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleBook(flight)}
                        >
                          BUY TICKET
                        </button>
                      </div>
                    ))}
                    {pagination && pagination.outbound && (
                      <div className="pagination">
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSearch(null, pagination.outbound.page - 1)}
                          disabled={pagination.outbound.page === 1 || loading}
                        >
                          Previous
                        </button>
                        <span>Page {pagination.outbound.page} of {pagination.outbound.totalPages}</span>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSearch(null, pagination.outbound.page + 1)}
                          disabled={pagination.outbound.page >= pagination.outbound.totalPages || loading}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {flights.return && flights.return.length > 0 && (
                  <div>
                    <h4>Return Flights</h4>
                    {flights.return.map(flight => (
                      <div key={flight.id} className="flight-card">
                        <div className="flight-info">
                          <div>
                            <strong>{flight.from_city}</strong> → <strong>{flight.to_city}</strong>
                          </div>
                          <div>Date: {flight.flight_date}</div>
                          <div>Duration: {flight.duration}</div>
                          <div>Price: ${flight.price}</div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleBook(flight)}
                        >
                          BUY TICKET
                        </button>
                      </div>
                    ))}
                    {pagination && pagination.return && (
                      <div className="pagination">
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSearch(null, pagination.return.page - 1)}
                          disabled={pagination.return.page === 1 || loading}
                        >
                          Previous
                        </button>
                        <span>Page {pagination.return.page} of {pagination.return.totalPages}</span>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSearch(null, pagination.return.page + 1)}
                          disabled={pagination.return.page >= pagination.return.totalPages || loading}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FlightSearch;
