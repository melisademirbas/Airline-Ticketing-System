// Initialize Azure SQL Database tables
const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: process.env.DB_HOST || 'airline-rg.database.windows.net',
  database: process.env.DB_NAME || 'airline-db',
  user: process.env.DB_USER || 'CloudSAba866292',
  password: process.env.DB_PASSWORD || 'Melisa354235',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true
  }
};

async function initDatabase() {
  try {
    console.log('Connecting to Azure SQL Database...');
    await sql.connect(dbConfig);
    console.log('Connected successfully!');

    const request = new sql.Request();
    
    // Create flights table
    console.log('Creating flights table...');
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
    console.log('✅ Flights table created');

    // Create bookings table
    console.log('Creating bookings table...');
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
    console.log('✅ Bookings table created');

    // Create miles_smiles_members table
    console.log('Creating miles_smiles_members table...');
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
    console.log('✅ Miles&Smiles members table created');

    // Create miles_transactions table
    console.log('Creating miles_transactions table...');
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
    console.log('✅ Miles transactions table created');

    console.log('\n✅ All tables initialized successfully!');
    await sql.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    await sql.close();
    process.exit(1);
  }
}

initDatabase();
