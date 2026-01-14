const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const amqp = require('amqplib');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Database connection - Azure SQL Database
const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'airline_db',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: true, // Azure SQL Database için gerekli
    trustServerCertificate: false, // Azure SQL Database requires proper certificates
    enableArithAbort: true,
    connectTimeout: 60000, // 60 seconds
    requestTimeout: 60000, // 60 seconds
    abortTransactionOnError: true,
    // Azure SQL Database specific settings
    useUTC: true
  },
  connectionTimeout: 60000, // 60 seconds
  requestTimeout: 60000, // 60 seconds
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000
  }
};

// Create connection pool
let poolPromise;
let pool = null;
const getPool = async () => {
  if (!pool) {
    try {
      console.log('🔄 Creating new database connection pool...');
      pool = await sql.connect(dbConfig);
      console.log('✅ Database connection pool created successfully');
      return pool;
    } catch (error) {
      console.error('❌ Failed to create connection pool:', error.message);
      pool = null;
      poolPromise = null;
      throw error;
    }
  }
  return pool;
};

// Memory Cache (in-memory cache instead of Redis)
const memoryCache = new Map();
const cacheTTL = new Map(); // Store expiration times

// Cache helper functions
const cache = {
  get: (key) => {
    const item = memoryCache.get(key);
    if (!item) return null;
    
    // Check if expired
    const expiration = cacheTTL.get(key);
    if (expiration && Date.now() > expiration) {
      memoryCache.delete(key);
      cacheTTL.delete(key);
      return null;
    }
    
    return item;
  },
  
  set: (key, value, ttlSeconds = 300) => {
    memoryCache.set(key, value);
    if (ttlSeconds > 0) {
      cacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
    }
  },
  
  del: (key) => {
    memoryCache.delete(key);
    cacheTTL.delete(key);
  },
  
  // Delete all keys matching a pattern (for wildcard deletes)
  delPattern: (pattern) => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of memoryCache.keys()) {
      if (regex.test(key)) {
        memoryCache.delete(key);
        cacheTTL.delete(key);
      }
    }
  },
  
  // Clean expired entries periodically
  cleanup: () => {
    const now = Date.now();
    for (const [key, expiration] of cacheTTL.entries()) {
      if (now > expiration) {
        memoryCache.delete(key);
        cacheTTL.delete(key);
      }
    }
  }
};

// Clean expired cache entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

console.log('Memory cache initialized (in-memory cache instead of Redis)');

// RabbitMQ connection
let channel = null;
const connectQueue = async () => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();
    await channel.assertQueue('new-miles-smiles-members', { durable: true });
    console.log('✅ Connected to RabbitMQ');
    
    // Handle connection errors gracefully
    connection.on('error', (err) => {
      console.error('❌ RabbitMQ connection error:', err.message);
      channel = null;
    });
    
    connection.on('close', () => {
      console.warn('⚠️ RabbitMQ connection closed. Will retry...');
      channel = null;
      // Retry connection after 5 seconds
      setTimeout(connectQueue, 5000);
    });
  } catch (error) {
    console.error('❌ RabbitMQ connection error:', error.message);
    console.warn('⚠️ Continuing without RabbitMQ. Queue features will be disabled.');
    channel = null;
    // Retry connection after 10 seconds
    setTimeout(connectQueue, 10000);
  }
};
connectQueue();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flight-service' });
});

// Initialize database tables
const initDatabase = async () => {
  try {
    await getPool();
    const request = new sql.Request();
    
    // Create flights table
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flights]') AND type in (N'U'))
      CREATE TABLE flights (
        id INT IDENTITY(1,1) PRIMARY KEY,
        flight_code VARCHAR(50) UNIQUE NOT NULL,
        from_city VARCHAR(100) NOT NULL,
        to_city VARCHAR(100) NOT NULL,
        flight_date DATE NOT NULL,
        duration VARCHAR(20) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        capacity INT NOT NULL,
        booked_seats INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE()
      )
    `);

    // Create bookings table
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[bookings]') AND type in (N'U'))
      CREATE TABLE bookings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        flight_id INT FOREIGN KEY REFERENCES flights(id),
        user_id VARCHAR(255) NOT NULL,
        miles_smiles_number VARCHAR(50),
        passenger_name VARCHAR(255) NOT NULL,
        passenger_surname VARCHAR(255) NOT NULL,
        passenger_dob DATE,
        booking_date DATETIME DEFAULT GETDATE(),
        paid_with_points BIT DEFAULT 0,
        points_used INT DEFAULT 0
      )
    `);

    // Create miles_smiles_members table
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[miles_smiles_members]') AND type in (N'U'))
      CREATE TABLE miles_smiles_members (
        id INT IDENTITY(1,1) PRIMARY KEY,
        member_number VARCHAR(50) UNIQUE NOT NULL,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        date_of_birth DATE,
        points_balance INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        welcome_email_sent BIT DEFAULT 0
      )
    `);

    // Create miles_transactions table
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[miles_transactions]') AND type in (N'U'))
      CREATE TABLE miles_transactions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        member_number VARCHAR(50) FOREIGN KEY REFERENCES miles_smiles_members(member_number),
        flight_id INT FOREIGN KEY REFERENCES flights(id),
        points INT NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        email_sent BIT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE()
      )
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

initDatabase();

// Helper: Get cache key
const getCacheKey = (key) => `flight:${key}`;

// Add Flight (Admin only)
app.post('/api/v1/flights', async (req, res) => {
  try {
    console.log('📥 Received flight creation request:', req.body);
    const { flight_code, from_city, to_city, flight_date, duration, price, capacity } = req.body;

    if (!flight_code || !from_city || !to_city || !flight_date || !duration || !price || !capacity) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('🔌 Connecting to database...');
    try {
      await getPool();
      console.log('✅ Database connected');
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      return res.status(503).json({ 
        error: 'Database connection failed. Please check your Azure SQL Database settings and firewall rules.' 
      });
    }
    
    const request = new sql.Request();
    request.input('flight_code', sql.VarChar, flight_code);
    request.input('from_city', sql.VarChar, from_city);
    request.input('to_city', sql.VarChar, to_city);
    request.input('flight_date', sql.Date, flight_date);
    request.input('duration', sql.VarChar, duration);
    request.input('price', sql.Decimal(10, 2), parseFloat(price));
    request.input('capacity', sql.Int, parseInt(capacity));

    console.log('💾 Inserting flight into database...');
    const result = await request.query(`
      INSERT INTO flights (flight_code, from_city, to_city, flight_date, duration, price, capacity)
      OUTPUT INSERTED.*
      VALUES (@flight_code, @from_city, @to_city, @flight_date, @duration, @price, @capacity)
    `);

    console.log('✅ Flight created successfully:', result.recordset[0]);

    // Invalidate cache
    cache.delPattern('^search:.*');

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('❌ Error creating flight:', error);
    console.error('Error details:', {
      message: error.message,
      number: error.number,
      code: error.code,
      originalError: error.originalError
    });
    
    if (error.number === 2627 || error.number === 2601) { // Unique constraint violation
      return res.status(409).json({ error: 'Flight code already exists' });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Search Flights with caching and pagination
app.get('/api/v1/flights/search', async (req, res) => {
  try {
    console.log('🔍 Flight search request:', req.query);
    const { from, to, departure_date, return_date, passengers, flexible_dates, direct_only, page = 1, limit = 10 } = req.query;

    if (!from || !to || !departure_date) {
      console.error('❌ Missing required parameters');
      return res.status(400).json({ error: 'Missing required search parameters' });
    }

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Max 100 per page
    const offset = (pageNum - 1) * limitNum;

    // Parse flexible_dates and direct_only
    const isFlexibleDates = flexible_dates === 'true' || flexible_dates === true;
    const isDirectOnly = direct_only === 'true' || direct_only === true;

    const cacheKey = `search:${from}:${to}:${departure_date}:${return_date || 'none'}:${passengers || 1}:${isFlexibleDates}:${isDirectOnly}:${pageNum}:${limitNum}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('✅ Returning cached results');
      return res.json(cached);
    }

    console.log('🔌 Connecting to database...');
    await getPool();
    console.log('✅ Database connected');
    
    // Calculate date range for flexible dates (±3 days)
    const baseDate = new Date(departure_date);
    let dateStart = baseDate;
    let dateEnd = baseDate;
    
    if (isFlexibleDates) {
      dateStart = new Date(baseDate);
      dateStart.setDate(dateStart.getDate() - 3);
      dateEnd = new Date(baseDate);
      dateEnd.setDate(dateEnd.getDate() + 3);
      console.log(`📅 Flexible dates: searching from ${dateStart.toISOString().split('T')[0]} to ${dateEnd.toISOString().split('T')[0]}`);
    }
    
    const request = new sql.Request();
    request.input('from', sql.VarChar, from);
    request.input('to', sql.VarChar, to);
    request.input('departure_date', sql.Date, departure_date);
    request.input('date_start', sql.Date, dateStart.toISOString().split('T')[0]);
    request.input('date_end', sql.Date, dateEnd.toISOString().split('T')[0]);
    request.input('passengers', sql.Int, parseInt(passengers) || 1);
    request.input('limit', sql.Int, limitNum);
    request.input('offset', sql.Int, offset);

    // Get total count for pagination
    const countRequest = new sql.Request();
    countRequest.input('from', sql.VarChar, from);
    countRequest.input('to', sql.VarChar, to);
    countRequest.input('departure_date', sql.Date, departure_date);
    countRequest.input('date_start', sql.Date, dateStart.toISOString().split('T')[0]);
    countRequest.input('date_end', sql.Date, dateEnd.toISOString().split('T')[0]);
    countRequest.input('passengers', sql.Int, parseInt(passengers) || 1);
    
    // Build WHERE clause for flexible dates
    const dateCondition = isFlexibleDates 
      ? 'AND flight_date >= @date_start AND flight_date <= @date_end'
      : 'AND flight_date = @departure_date';
    
    const countQuery = `
      SELECT COUNT(*) as total FROM flights 
      WHERE UPPER(from_city) LIKE UPPER(@from) AND UPPER(to_city) LIKE UPPER(@to)
      ${dateCondition}
      AND (capacity - booked_seats) >= @passengers
    `;
    console.log('📊 Getting total count...');
    const countResult = await countRequest.query(countQuery);
    const total = countResult.recordset[0].total;
    console.log(`✅ Total flights found: ${total}`);

    // Build query with flexible dates and direct flights filter
    let query = `
      SELECT * FROM flights 
      WHERE UPPER(from_city) LIKE UPPER(@from) AND UPPER(to_city) LIKE UPPER(@to)
      ${dateCondition}
      AND (capacity - booked_seats) >= @passengers
    `;
    
    // Filter direct flights only (duration-based heuristic: flights < 6 hours are likely direct)
    // Note: This is a heuristic since we don't have a stops column yet
    if (isDirectOnly) {
      console.log('✈️ Filtering for direct flights only (duration < 6 hours)');
      // We'll filter in JavaScript after fetching, as SQL Server doesn't easily parse duration strings
    }
    
    query += `
      ORDER BY flight_date, price
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    console.log('🔍 Executing search query...');
    const result = await request.query(query);
    let flights = result.recordset;
    console.log(`✅ Found ${flights.length} flights`);

    // Helper function to parse duration and check if flight is direct
    const isDirectFlight = (durationStr) => {
      if (!durationStr) return true; // Assume direct if no duration info
      // Parse duration like "2h 30m" or "5h"
      const hoursMatch = durationStr.match(/(\d+)h/);
      const minutesMatch = durationStr.match(/(\d+)m/);
      const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
      const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
      const totalHours = hours + (minutes / 60);
      // Flights < 6 hours are likely direct (heuristic)
      return totalHours < 6;
    };

    // Filter direct flights if requested
    if (isDirectOnly) {
      flights = flights.filter(flight => isDirectFlight(flight.duration));
      console.log(`✈️ Filtered to ${flights.length} direct flights`);
    }

    // If return date specified, search for return flights
    if (return_date) {
      const returnRequest = new sql.Request();
      returnRequest.input('from', sql.VarChar, to);
      returnRequest.input('to', sql.VarChar, from);
      returnRequest.input('return_date', sql.Date, return_date);
      returnRequest.input('passengers', sql.Int, parseInt(passengers) || 1);
      returnRequest.input('limit', sql.Int, limitNum);
      returnRequest.input('offset', sql.Int, offset);
      
      // Calculate date range for flexible dates on return (±3 days)
      const returnBaseDate = new Date(return_date);
      let returnDateStart = returnBaseDate;
      let returnDateEnd = returnBaseDate;
      
      if (isFlexibleDates) {
        returnDateStart = new Date(returnBaseDate);
        returnDateStart.setDate(returnDateStart.getDate() - 3);
        returnDateEnd = new Date(returnBaseDate);
        returnDateEnd.setDate(returnDateEnd.getDate() + 3);
      }
      
      // Get return flights count
      const returnCountRequest = new sql.Request();
      returnCountRequest.input('from', sql.VarChar, to);
      returnCountRequest.input('to', sql.VarChar, from);
      returnCountRequest.input('return_date', sql.Date, return_date);
      returnCountRequest.input('return_date_start', sql.Date, returnDateStart.toISOString().split('T')[0]);
      returnCountRequest.input('return_date_end', sql.Date, returnDateEnd.toISOString().split('T')[0]);
      returnCountRequest.input('passengers', sql.Int, parseInt(passengers) || 1);
      
      const returnDateCondition = isFlexibleDates 
        ? 'AND flight_date >= @return_date_start AND flight_date <= @return_date_end'
        : 'AND flight_date = @return_date';
      
      const returnCountQuery = `
        SELECT COUNT(*) as total FROM flights 
        WHERE UPPER(from_city) LIKE UPPER(@from) AND UPPER(to_city) LIKE UPPER(@to)
        ${returnDateCondition}
        AND (capacity - booked_seats) >= @passengers
      `;
      const returnCountResult = await returnCountRequest.query(returnCountQuery);
      const returnTotal = returnCountResult.recordset[0].total;
      
      returnRequest.input('return_date_start', sql.Date, returnDateStart.toISOString().split('T')[0]);
      returnRequest.input('return_date_end', sql.Date, returnDateEnd.toISOString().split('T')[0]);
      
      const returnQuery = `
        SELECT * FROM flights 
        WHERE UPPER(from_city) LIKE UPPER(@from) AND UPPER(to_city) LIKE UPPER(@to)
        ${returnDateCondition}
        AND (capacity - booked_seats) >= @passengers
        ORDER BY flight_date, price
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;
      const returnResult = await returnRequest.query(returnQuery);
      let returnFlights = returnResult.recordset;
      
      // Filter direct flights for return if requested
      if (isDirectOnly) {
        returnFlights = returnFlights.filter(flight => isDirectFlight(flight.duration));
        console.log(`✈️ Filtered to ${returnFlights.length} direct return flights`);
      }
      
      // Recalculate total after filtering
      const filteredOutboundTotal = isDirectOnly ? flights.length : total;
      const filteredReturnTotal = isDirectOnly ? returnFlights.length : returnTotal;
      
      flights = {
        outbound: {
          data: flights,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: filteredOutboundTotal,
            totalPages: Math.ceil(filteredOutboundTotal / limitNum)
          }
        },
        return: {
          data: returnFlights,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: filteredReturnTotal,
            totalPages: Math.ceil(filteredReturnTotal / limitNum)
          }
        }
      };
    } else {
      // Single trip - add pagination
      // Recalculate total after filtering
      const filteredTotal = isDirectOnly ? flights.length : total;
      flights = {
        data: flights,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredTotal,
          totalPages: Math.ceil(filteredTotal / limitNum)
        }
      };
    }

    // Cache for 5 minutes (300 seconds)
    cache.set(cacheKey, flights, 300);

    console.log('✅ Search completed successfully');
    res.json(flights);
  } catch (error) {
    console.error('❌ Error in flight search:', error);
    console.error('Error details:', {
      message: error.message,
      number: error.number,
      code: error.code,
      originalError: error.originalError,
      stack: error.stack
    });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get Flight by ID
app.get('/api/v1/flights/:id', async (req, res) => {
  try {
    const cacheKey = getCacheKey(req.params.id);
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    await getPool();
    const request = new sql.Request();
    request.input('id', sql.Int, req.params.id);
    const result = await request.query('SELECT * FROM flights WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    // Cache for 10 minutes (600 seconds)
    cache.set(cacheKey, result.recordset[0], 600);
    res.json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buy Ticket
app.post('/api/v1/flights/:flightId/book', async (req, res) => {
  const transaction = new sql.Transaction();
  
  try {
    await getPool();
    await transaction.begin();

    const { userId, passenger_name, passenger_surname, passenger_dob, miles_smiles_number, use_points } = req.body;
    const flightId = req.params.flightId;

    // Get flight with lock
    const flightRequest = new sql.Request(transaction);
    flightRequest.input('flightId', sql.Int, flightId);
    const flightResult = await flightRequest.query(`
      SELECT * FROM flights WITH (UPDLOCK, ROWLOCK) WHERE id = @flightId
    `);
    
    if (flightResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Flight not found' });
    }

    const flight = flightResult.recordset[0];

    // Check capacity - passengers count (default 1, but should be from request)
    const passengers = req.body.passengers || 1;
    if (flight.booked_seats + passengers > flight.capacity) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: `Not enough seats available. Requested: ${passengers}, Available: ${flight.capacity - flight.booked_seats}` 
      });
    }

    let pointsUsed = 0;
    let memberNumber = miles_smiles_number;
    let isNewMember = false;

    // Handle Miles&Smiles member
    if (req.body.become_member || miles_smiles_number || use_points) {
      if (!miles_smiles_number && req.body.become_member) {
        // Create new member
        isNewMember = true;
        memberNumber = `MS${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const email = req.body.email || `${userId}@example.com`;
        
        console.log('🆕 Creating new Miles&Smiles member:', memberNumber);
        
        const memberRequest = new sql.Request(transaction);
        memberRequest.input('member_number', sql.VarChar, memberNumber);
        memberRequest.input('user_id', sql.VarChar, userId);
        memberRequest.input('email', sql.VarChar, email);
        memberRequest.input('first_name', sql.VarChar, passenger_name);
        memberRequest.input('last_name', sql.VarChar, passenger_surname);
        memberRequest.input('date_of_birth', sql.Date, passenger_dob);
        
        await memberRequest.query(`
          INSERT INTO miles_smiles_members (member_number, user_id, email, first_name, last_name, date_of_birth)
          VALUES (@member_number, @user_id, @email, @first_name, @last_name, @date_of_birth)
        `);

        console.log('✅ New Miles&Smiles member created:', memberNumber);

        // Send to queue for welcome email
        if (channel) {
          channel.sendToQueue('new-miles-smiles-members', Buffer.from(JSON.stringify({
            member_number: memberNumber,
            email: email,
            name: `${passenger_name} ${passenger_surname}`
          })));
        }
      } else {
        // Check if member exists and has enough points
        const memberRequest = new sql.Request(transaction);
        memberRequest.input('member_number', sql.VarChar, miles_smiles_number);
        const memberResult = await memberRequest.query(
          'SELECT * FROM miles_smiles_members WHERE member_number = @member_number'
        );

        if (memberResult.recordset.length === 0) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Miles&Smiles member not found' });
        }

        const member = memberResult.recordset[0];

        if (use_points && member.points_balance < flight.price) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Insufficient points' });
        }

        if (use_points) {
          pointsUsed = Math.floor(flight.price);
          const updateRequest = new sql.Request(transaction);
          updateRequest.input('points', sql.Int, pointsUsed);
          updateRequest.input('member_number', sql.VarChar, miles_smiles_number);
          await updateRequest.query(
            'UPDATE miles_smiles_members SET points_balance = points_balance - @points WHERE member_number = @member_number'
          );
        }
      }
    }

    // Create booking
    const bookingRequest = new sql.Request(transaction);
    bookingRequest.input('flight_id', sql.Int, flightId);
    bookingRequest.input('user_id', sql.VarChar, userId);
    bookingRequest.input('miles_smiles_number', sql.VarChar, memberNumber);
    bookingRequest.input('passenger_name', sql.VarChar, passenger_name);
    bookingRequest.input('passenger_surname', sql.VarChar, passenger_surname);
    bookingRequest.input('passenger_dob', sql.Date, passenger_dob);
    bookingRequest.input('paid_with_points', sql.Bit, use_points || false);
    bookingRequest.input('points_used', sql.Int, pointsUsed);
    
    const bookingResult = await bookingRequest.query(`
      INSERT INTO bookings (flight_id, user_id, miles_smiles_number, passenger_name, passenger_surname, passenger_dob, paid_with_points, points_used)
      OUTPUT INSERTED.*
      VALUES (@flight_id, @user_id, @miles_smiles_number, @passenger_name, @passenger_surname, @passenger_dob, @paid_with_points, @points_used)
    `);

    // Update flight capacity - reduce by number of passengers
    const updateFlightRequest = new sql.Request(transaction);
    updateFlightRequest.input('flightId', sql.Int, flightId);
    updateFlightRequest.input('passengers', sql.Int, passengers);
    await updateFlightRequest.query(
      'UPDATE flights SET booked_seats = booked_seats + @passengers WHERE id = @flightId'
    );

    await transaction.commit();

    // Invalidate cache
    cache.del(`flight:${flightId}`);
    cache.delPattern('^search:.*');

    res.status(201).json({
      booking: bookingResult.recordset[0],
      flight: { ...flight, booked_seats: flight.booked_seats + passengers },
      member_number: memberNumber || null, // Include member number in response
      is_new_member: isNewMember // Indicate if this is a new member
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Add Miles to Account (for completed flights)
app.post('/api/v1/miles/add', async (req, res) => {
  const transaction = new sql.Transaction();
  
  try {
    const { member_number, flight_id, points, transaction_date } = req.body;

    if (!member_number || !flight_id || !points) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await getPool();
    await transaction.begin();

    // Add points to member
    const updateRequest = new sql.Request(transaction);
    updateRequest.input('points', sql.Int, points);
    updateRequest.input('member_number', sql.VarChar, member_number);
    await updateRequest.query(
      'UPDATE miles_smiles_members SET points_balance = points_balance + @points WHERE member_number = @member_number'
    );

    // Record transaction
    const insertRequest = new sql.Request(transaction);
    insertRequest.input('member_number', sql.VarChar, member_number);
    insertRequest.input('flight_id', sql.Int, flight_id);
    insertRequest.input('points', sql.Int, points);
    insertRequest.input('transaction_date', sql.Date, transaction_date || new Date().toISOString().split('T')[0]);
    await insertRequest.query(`
      INSERT INTO miles_transactions (member_number, flight_id, points, transaction_date, transaction_type)
      VALUES (@member_number, @flight_id, @points, @transaction_date, 'FLIGHT_COMPLETED')
    `);

    await transaction.commit();
    res.json({ success: true, message: 'Miles added successfully' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// Get Miles&Smiles member by member number
app.get('/api/v1/miles/member/:memberNumber', async (req, res) => {
  try {
    const { memberNumber } = req.params;
    
    await getPool();
    const request = new sql.Request();
    request.input('member_number', sql.VarChar, memberNumber);
    
    const result = await request.query(`
      SELECT member_number, email, first_name, last_name, date_of_birth, points_balance
      FROM miles_smiles_members
      WHERE member_number = @member_number
    `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Miles&Smiles member not found' });
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Miles&Smiles member by user ID
app.get('/api/v1/miles/member-by-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await getPool();
    const request = new sql.Request();
    request.input('user_id', sql.VarChar, userId);
    
    const result = await request.query(`
      SELECT member_number, email, first_name, last_name, date_of_birth, points_balance
      FROM miles_smiles_members
      WHERE user_id = @user_id
    `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Miles&Smiles member not found for this user' });
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bookings for a user
app.get('/api/v1/bookings', async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    await getPool();
    const request = new sql.Request();
    request.input('userId', sql.VarChar, userId);
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, offset);
    
    const result = await request.query(`
      SELECT b.*, f.* FROM bookings b
      INNER JOIN flights f ON b.flight_id = f.id
      WHERE b.user_id = @userId
      ORDER BY b.booking_date DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    const countRequest = new sql.Request();
    countRequest.input('userId', sql.VarChar, userId);
    const countResult = await countRequest.query(
      'SELECT COUNT(*) as count FROM bookings WHERE user_id = @userId'
    );

    res.json({
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].count,
        totalPages: Math.ceil(countResult.recordset[0].count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Extract unique cities and airlines from dataset (one-time load)
let airportsCache = null;
let airlinesCache = null;
let cacheLoaded = false;

const loadAirportsAndAirlines = async () => {
  if (cacheLoaded && airportsCache && airlinesCache) {
    return { airports: airportsCache, airlines: airlinesCache };
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const csv = require('csv-parser');
    const csvPath = path.join(__dirname, '..', 'Clean_Dataset.csv');
    
    const airports = new Set();
    const airlines = new Set();

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(csvPath)) {
        console.warn('⚠️ Clean_Dataset.csv not found, using database cities');
        // Fallback: Get cities from database
        getPool().then(async (pool) => {
          try {
            const request = new sql.Request();
            const result = await request.query(`
              SELECT DISTINCT from_city as city FROM flights
              UNION
              SELECT DISTINCT to_city as city FROM flights
            `);
            const dbCities = result.recordset.map(r => r.city).filter(c => c);
            airportsCache = dbCities.sort();
            airlinesCache = []; // No airline data in flights table
            cacheLoaded = true;
            console.log(`✅ Loaded ${airportsCache.length} airports from database (fallback)`);
            resolve({ airports: airportsCache, airlines: [] });
          } catch (dbError) {
            console.error('❌ Error loading cities from database:', dbError);
            reject(dbError);
          }
        }).catch(reject);
        return;
      }

      console.log('📖 Reading Clean_Dataset.csv for airports and airlines...');
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.source_city) airports.add(row.source_city);
          if (row.destination_city) airports.add(row.destination_city);
          if (row.airline) airlines.add(row.airline);
        })
        .on('end', () => {
          airportsCache = Array.from(airports).sort();
          airlinesCache = Array.from(airlines).sort();
          cacheLoaded = true;
          console.log(`✅ Loaded ${airportsCache.length} airports and ${airlinesCache.length} airlines from dataset`);
          resolve({ airports: airportsCache, airlines: airlinesCache });
        })
        .on('error', (error) => {
          console.error('❌ Error reading CSV file:', error);
          reject(error);
        });
    });
  } catch (error) {
    console.error('❌ Error loading airports/airlines:', error);
    throw error;
  }
};

// Get Airports (Cached)
app.get('/api/v1/airports', async (req, res) => {
  try {
    const cacheKey = 'airports:list';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached airports list');
      return res.json({ airports: cached, cached: true, count: cached.length });
    }

    const { airports } = await loadAirportsAndAirlines();
    
    // Cache for 24 hours (86400 seconds)
    cache.set(cacheKey, airports, 86400);
    
    console.log(`✅ Returning ${airports.length} airports (fresh load)`);
    res.json({ airports, cached: false, count: airports.length });
  } catch (error) {
    console.error('❌ Error getting airports:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get Airlines (Cached)
app.get('/api/v1/airlines', async (req, res) => {
  try {
    const cacheKey = 'airlines:list';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached airlines list');
      return res.json({ airlines: cached, cached: true, count: cached.length });
    }

    const { airlines } = await loadAirportsAndAirlines();
    
    // Cache for 24 hours (86400 seconds)
    cache.set(cacheKey, airlines, 86400);
    
    console.log(`✅ Returning ${airlines.length} airlines (fresh load)`);
    res.json({ airlines, cached: false, count: airlines.length });
  } catch (error) {
    console.error('❌ Error getting airlines:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Flight Service running on port ${PORT}`);
});
