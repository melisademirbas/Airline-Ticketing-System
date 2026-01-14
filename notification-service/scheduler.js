const cron = require('node-cron');
const sql = require('mssql');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Database connection - Azure SQL Database
const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'airline_db',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true
  }
};

// Create connection pool
let poolPromise;
const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise;
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Send welcome emails to new members who haven't received one
const sendPendingWelcomeEmails = async () => {
  try {
    await getPool();
    const request = new sql.Request();
    const result = await request.query(`
      SELECT member_number, email, first_name, last_name 
      FROM miles_smiles_members 
      WHERE welcome_email_sent = 0
    `);

    for (const member of result.recordset) {
      const name = `${member.first_name} ${member.last_name}`;
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: member.email,
        subject: 'Welcome to Miles&Smiles!',
        html: `
          <h2>Welcome to Miles&Smiles, ${name}!</h2>
          <p>Thank you for joining our loyalty program. You can now earn miles with every flight!</p>
          <p>Start earning miles today and enjoy exclusive benefits.</p>
          <p>Best regards,<br>Turkish Airlines</p>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        const updateRequest = new sql.Request();
        updateRequest.input('member_number', sql.VarChar, member.member_number);
        await updateRequest.query(
          'UPDATE miles_smiles_members SET welcome_email_sent = 1 WHERE member_number = @member_number'
        );
        console.log(`Welcome email sent to ${member.email}`);
      } catch (error) {
        console.error(`Error sending email to ${member.email}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in sendPendingWelcomeEmails:', error);
  }
};

// Process completed flights and add miles, then send emails
const processCompletedFlights = async () => {
  try {
    // Get flights that ended yesterday (assuming flight_date + duration = completion)
    // In a real system, you'd have an actual completion date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Get bookings for flights that completed yesterday
    await getPool();
    const request = new sql.Request();
    request.input('yesterday', sql.Date, yesterdayStr);
    const result = await request.query(`
      SELECT b.miles_smiles_number, b.flight_id, f.price, m.email, m.first_name, m.last_name, m.points_balance
      FROM bookings b
      INNER JOIN flights f ON b.flight_id = f.id
      INNER JOIN miles_smiles_members m ON b.miles_smiles_number = m.member_number
      WHERE f.flight_date = @yesterday
      AND b.paid_with_points = 0
      AND NOT EXISTS (
        SELECT 1 FROM miles_transactions mt 
        WHERE mt.flight_id = b.flight_id 
        AND mt.member_number = b.miles_smiles_number
      )
    `);

    for (const booking of result.recordset) {
      if (!booking.miles_smiles_number) continue;

      const pointsToAdd = Math.floor(booking.price); // 1 mile per dollar spent

      try {
        // Add points
        const updateRequest = new sql.Request();
        updateRequest.input('points', sql.Int, pointsToAdd);
        updateRequest.input('member_number', sql.VarChar, booking.miles_smiles_number);
        await updateRequest.query(
          'UPDATE miles_smiles_members SET points_balance = points_balance + @points WHERE member_number = @member_number'
        );

        // Record transaction
        const insertRequest = new sql.Request();
        insertRequest.input('member_number', sql.VarChar, booking.miles_smiles_number);
        insertRequest.input('flight_id', sql.Int, booking.flight_id);
        insertRequest.input('points', sql.Int, pointsToAdd);
        insertRequest.input('transaction_date', sql.Date, yesterdayStr);
        await insertRequest.query(`
          INSERT INTO miles_transactions (member_number, flight_id, points, transaction_date, transaction_type, email_sent)
          VALUES (@member_number, @flight_id, @points, @transaction_date, 'FLIGHT_COMPLETED', 0)
        `);

        // Send email
        const name = `${booking.first_name} ${booking.last_name}`;
        const newBalance = booking.points_balance + pointsToAdd;
        
        const mailOptions = {
          from: process.env.GMAIL_USER,
          to: booking.email,
          subject: 'Miles Added to Your Account',
          html: `
            <h2>Hello ${name},</h2>
            <p>Great news! We've added <strong>${pointsToAdd} miles</strong> to your Miles&Smiles account.</p>
            <p>Your current balance: <strong>${newBalance} miles</strong></p>
            <p>Thank you for flying with us!</p>
            <p>Best regards,<br>Turkish Airlines</p>
          `
        };

        await transporter.sendMail(mailOptions);
        
        // Mark email as sent
        const updateEmailRequest = new sql.Request();
        updateEmailRequest.input('member_number', sql.VarChar, booking.miles_smiles_number);
        updateEmailRequest.input('flight_id', sql.Int, booking.flight_id);
        await updateEmailRequest.query(
          'UPDATE miles_transactions SET email_sent = 1 WHERE member_number = @member_number AND flight_id = @flight_id'
        );

        console.log(`Miles added and email sent to ${booking.email}`);
      } catch (error) {
        console.error(`Error processing booking for ${booking.email}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in processCompletedFlights:', error);
  }
};

// Export functions for use in server.js (for HTTP endpoints)
module.exports = {
  processCompletedFlights,
  sendPendingWelcomeEmails
};

// Run nightly at 2 AM (only if running as standalone script)
if (require.main === module) {
  cron.schedule('0 2 * * *', () => {
    console.log('Running nightly scheduled tasks...');
    processCompletedFlights();
    sendPendingWelcomeEmails();
  });

  // Also run welcome email check every hour
  cron.schedule('0 * * * *', () => {
    console.log('Checking for pending welcome emails...');
    sendPendingWelcomeEmails();
  });

  console.log('Scheduler started. Tasks will run at scheduled times.');

  // Keep process alive
  setInterval(() => {}, 1000);
}
