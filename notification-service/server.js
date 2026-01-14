const express = require('express');
const nodemailer = require('nodemailer');
const amqp = require('amqplib');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD // Use App Password, not regular password
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

// Send welcome email to new Miles&Smiles members
const sendWelcomeEmail = async (email, name) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Welcome to Miles&Smiles!',
      html: `
        <h2>Welcome to Miles&Smiles, ${name}!</h2>
        <p>Thank you for joining our loyalty program. You can now earn miles with every flight!</p>
        <p>Start earning miles today and enjoy exclusive benefits.</p>
        <p>Best regards,<br>Turkish Airlines</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

// Send miles update email
const sendMilesUpdateEmail = async (email, name, pointsAdded, totalPoints) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Miles Added to Your Account',
      html: `
        <h2>Hello ${name},</h2>
        <p>Great news! We've added <strong>${pointsAdded} miles</strong> to your Miles&Smiles account.</p>
        <p>Your current balance: <strong>${totalPoints} miles</strong></p>
        <p>Thank you for flying with us!</p>
        <p>Best regards,<br>Turkish Airlines</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Miles update email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending miles update email:', error);
    return false;
  }
};

// Process queue for new Miles&Smiles members
const processNewMemberQueue = async () => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();
    
    await channel.assertQueue('new-miles-smiles-members', { durable: true });
    
    console.log('✅ Connected to RabbitMQ - Waiting for new member messages...');
    
    // Handle connection errors gracefully
    connection.on('error', (err) => {
      console.error('❌ RabbitMQ connection error:', err.message);
      console.warn('⚠️ Continuing without RabbitMQ. Queue features will be disabled.');
    });
    
    connection.on('close', () => {
      console.warn('⚠️ RabbitMQ connection closed. Will retry...');
      // Retry connection after 5 seconds
      setTimeout(processNewMemberQueue, 5000);
    });
    
    channel.consume('new-miles-smiles-members', async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          console.log('📧 Processing welcome email for:', data.email);
          await sendWelcomeEmail(data.email, data.name);
          channel.ack(msg);
          console.log('✅ Welcome email sent and message acknowledged');
        } catch (error) {
          console.error('❌ Error processing new member:', error);
          channel.nack(msg, false, false);
        }
      }
    });
  } catch (error) {
    console.error('❌ RabbitMQ connection error:', error.message);
    console.warn('⚠️ Continuing without RabbitMQ. Queue features will be disabled.');
    console.warn('⚠️ Welcome emails will not be sent via queue. Retrying in 10 seconds...');
    // Retry connection after 10 seconds
    setTimeout(processNewMemberQueue, 10000);
  }
};

// External Airlines Authentication Middleware
const authenticateExternalAirline = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.EXTERNAL_AIRLINE_API_KEY;

  if (!validApiKey) {
    console.warn('⚠️ EXTERNAL_AIRLINE_API_KEY not configured');
    return res.status(500).json({ error: 'External airline authentication not configured' });
  }

  if (!apiKey || apiKey !== validApiKey) {
    console.error('❌ Invalid API key for external airline request');
    return res.status(401).json({ error: 'Invalid API key. Authentication required.' });
  }

  console.log('✅ External airline authenticated');
  next();
};

// Database connection helper for external airlines
const getDbConnection = async () => {
  const dbConfig = {
    server: process.env.DB_HOST || 'airline-rg.database.windows.net',
    database: process.env.DB_NAME || 'airline-db',
    user: process.env.DB_USER || 'CloudSAba866292',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true
    }
  };
  return await sql.connect(dbConfig);
};

// API endpoint for external airlines to add miles (authenticated)
app.post('/api/v1/miles/add-external', authenticateExternalAirline, async (req, res) => {
  let dbConnection = null;
  try {
    const { member_number, points, email, name } = req.body;

    if (!member_number || !points || !email) {
      return res.status(400).json({ error: 'Missing required fields: member_number, points, email' });
    }

    console.log(`📥 External airline request: Adding ${points} miles to member ${member_number}`);

    // Connect to database
    dbConnection = await getDbConnection();
    console.log('✅ Database connected for external airline request');

    // Get current member info
    const memberRequest = new sql.Request();
    memberRequest.input('member_number', sql.VarChar, member_number);
    const memberResult = await memberRequest.query(
      'SELECT points_balance, email, first_name, last_name FROM miles_smiles_members WHERE member_number = @member_number'
    );

    if (memberResult.recordset.length === 0) {
      await sql.close();
      console.error('❌ Miles&Smiles member not found:', member_number);
      return res.status(404).json({ error: 'Miles&Smiles member not found' });
    }

    const member = memberResult.recordset[0];
    const currentBalance = member.points_balance || 0;
    const pointsToAdd = parseInt(points);
    const newBalance = currentBalance + pointsToAdd;

    // Update points balance
    const updateRequest = new sql.Request();
    updateRequest.input('member_number', sql.VarChar, member_number);
    updateRequest.input('points', sql.Int, pointsToAdd);
    await updateRequest.query(
      'UPDATE miles_smiles_members SET points_balance = points_balance + @points WHERE member_number = @member_number'
    );
    console.log(`✅ Updated points balance for member ${member_number}: ${currentBalance} → ${newBalance}`);

    // Record transaction
    const transactionRequest = new sql.Request();
    transactionRequest.input('member_number', sql.VarChar, member_number);
    transactionRequest.input('points', sql.Int, pointsToAdd);
    transactionRequest.input('transaction_date', sql.Date, new Date().toISOString().split('T')[0]);
    transactionRequest.input('transaction_type', sql.VarChar, 'EXTERNAL_AIRLINE');
    await transactionRequest.query(`
      INSERT INTO miles_transactions (member_number, flight_id, points, transaction_date, transaction_type, email_sent)
      VALUES (@member_number, NULL, @points, @transaction_date, @transaction_type, 0)
    `);
    console.log(`✅ Transaction recorded for member ${member_number}`);

    await sql.close();
    dbConnection = null;

    // Send email
    const memberName = name || `${member.first_name} ${member.last_name}`;
    const emailSent = await sendMilesUpdateEmail(member.email, memberName, pointsToAdd, newBalance);

    console.log(`✅ External airline added ${pointsToAdd} miles to member ${member_number}`);
    res.json({ 
      success: true, 
      message: 'Miles added and email sent',
      member_number,
      points_added: pointsToAdd,
      previous_balance: currentBalance,
      new_balance: newBalance,
      email_sent: emailSent
    });
  } catch (error) {
    console.error('❌ Error in external miles addition:', error);
    if (dbConnection) {
      try {
        await sql.close();
      } catch (closeError) {
        console.error('Error closing database connection:', closeError);
      }
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Start processing queue
processNewMemberQueue();

// Import scheduler functions
const { processCompletedFlights, sendPendingWelcomeEmails } = require('./scheduler');

// Scheduler Authentication Middleware (for cloud scheduler calls)
const authenticateScheduler = (req, res, next) => {
  const apiKey = req.headers['x-scheduler-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.SCHEDULER_API_KEY || process.env.EXTERNAL_AIRLINE_API_KEY;

  if (!validApiKey) {
    console.warn('⚠️ SCHEDULER_API_KEY not configured');
    return res.status(500).json({ error: 'Scheduler authentication not configured' });
  }

  if (!apiKey || apiKey !== validApiKey) {
    console.error('❌ Invalid scheduler API key');
    return res.status(401).json({ error: 'Invalid API key. Authentication required.' });
  }

  console.log('✅ Scheduler authenticated');
  next();
};

// Scheduler Endpoints (for cloud scheduler)
app.post('/api/v1/scheduler/process-completed-flights', authenticateScheduler, async (req, res) => {
  try {
    console.log('📅 Cloud scheduler triggered: Processing completed flights...');
    await processCompletedFlights();
    console.log('✅ Completed flights processed successfully');
    res.json({ 
      success: true, 
      message: 'Completed flights processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error processing completed flights:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
});

app.post('/api/v1/scheduler/send-welcome-emails', authenticateScheduler, async (req, res) => {
  try {
    console.log('📅 Cloud scheduler triggered: Sending pending welcome emails...');
    await sendPendingWelcomeEmails();
    console.log('✅ Welcome emails processed successfully');
    res.json({ 
      success: true, 
      message: 'Welcome emails processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error sending welcome emails:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
});

// Combined endpoint for nightly tasks (runs both)
app.post('/api/v1/scheduler/nightly-tasks', authenticateScheduler, async (req, res) => {
  try {
    console.log('📅 Cloud scheduler triggered: Running nightly tasks...');
    await processCompletedFlights();
    await sendPendingWelcomeEmails();
    console.log('✅ Nightly tasks completed successfully');
    res.json({ 
      success: true, 
      message: 'Nightly tasks completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in nightly tasks:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Notification Service running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
  console.log(`📅 Scheduler endpoints available at:`);
  console.log(`   POST /api/v1/scheduler/process-completed-flights`);
  console.log(`   POST /api/v1/scheduler/send-welcome-emails`);
  console.log(`   POST /api/v1/scheduler/nightly-tasks`);
});
