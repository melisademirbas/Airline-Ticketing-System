# Airline Ticketing System

A microservices-based airline ticketing system with Miles&Smiles loyalty program integration, machine learning price prediction, and cloud-ready architecture.

# Local Development Environment
- Frontend**: `http://localhost:3000`
- API Gateway**: `http://localhost:3001`
- Flight Service**: `http://localhost:3002`
- Notification Service**: `http://localhost:3003`
- ML Service**: `http://localhost:3004`

---

# Architecture & Design

# System Architecture

The system follows a "microservices architecture" pattern with the following components:

```
┌─────────────┐
│   Frontend  │ (React.js)
│  Port 3000  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ API Gateway │ (Express.js)
│  Port 3001  │
└──────┬──────┘
       │
       ├──────────┬──────────────┬─────────────┐
       ▼          ▼              ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Flight  │ │Notification│ │   ML    │ │  Queue   │
│ Service  │ │  Service   │ │ Service  │ │(RabbitMQ)│
│Port 3002 │ │Port 3003   │ │Port 3004 │ │          │
└────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘
     │             │              │            │
     └─────────────┴──────────────┴────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Azure SQL DB  │
            │  (Database)    │
            └───────────────┘
```

# Design Decisions

1. Microservices Architecture**: Each service is independently deployable and scalable
2. API Gateway Pattern**: Single entry point for all client requests with authentication
3. Message Queue (RabbitMQ)**: Asynchronous processing for welcome emails and notifications
4. In-Memory Caching**: Fast response times for frequently accessed data (airport names, airline destinations)
5. Machine Learning Integration**: Python-based ML service for dynamic price prediction
6. IAM Integration**: AWS Cognito for centralized authentication and authorization

# Technology Stack

- Frontend**: React.js, React Router, Axios
- Backend**: Node.js, Express.js
- Database**: Azure SQL Database (Microsoft SQL Server)
- Authentication**: AWS Cognito (IAM)
- Message Queue**: RabbitMQ (CloudAMQP)
- Caching**: In-memory cache (Map-based with TTL)
- ML Service**: Python 3, scikit-learn, pandas, joblib
- Email: Nodemailer with Gmail SMTP
- Cloud Scheduler**: Azure Logic Apps (configurable)

---

# Assumptions

1. User Authentication: 
   - All users must authenticate via AWS Cognito before accessing the system
   - Two roles: `Admin` and `User` (managed via Cognito groups)
   - Admin users can add flights; regular users can search and book

2. Flight Capacity:
   - Capacity is reduced by the number of passengers in a booking
   - No overbooking allowed (capacity check before booking)

3. Miles&Smiles Program:
   - New members are automatically assigned a unique member number (format: `MS{timestamp}{random}`)
   - Points can be used to pay for flights (1 point = 1 currency unit)
   - Points are added after flight completion (via scheduled tasks)
   - Welcome emails are sent asynchronously via RabbitMQ queue

4. Price Prediction:
   - ML model uses Random Forest algorithm
   - Predictions are based on: duration, route, date, days until departure
   - Fallback heuristic is used if ML model fails

5. Flexible Dates:
   - ±3 days range from selected departure date
   - Applied to both outbound and return flights

6. Direct Flights:
   - Heuristic: Flights with duration < 6 hours are considered direct
   - Can be enhanced with explicit `stops` column in database

7. Email Delivery:
   - Gmail SMTP is used for email sending
   - App Password is required (not regular password)
   - Emails may be delayed or go to spam folder

8. Database:
   - Azure SQL Database is used (SQL Server compatible)
   - Tables are auto-created on first service start
   - No manual migration scripts required

---

# Issues Encountered & Solutions

# 1. ML Model Loading Issue
- Problem**: Node.js cannot directly load `.pkl` (Python pickle) files
- Solution**: Created Python wrapper script (`predict.py`) that loads the model and is called via `child_process.spawn`

# 2. Port Conflicts
- Problem: Multiple services trying to use the same ports
- Solution: Standardized port allocation:
  - Frontend: 3000
  - API Gateway: 3001
  - Flight Service: 3002
  - Notification Service: 3003
  - ML Service: 3004

# 3. Redis Connection Timeout
- Problem: Azure Redis Cache connection failures due to firewall rules
- Solution: Switched to in-memory cache implementation (Map-based with TTL) as per instructor's allowance

# 4. Auth0 Redirect Loop
- Problem: After login, users were redirected back to login page instead of application
- Solution: Switched to AWS Cognito for more reliable OAuth flow and better integration

# 5. AWS Cognito "Force Change Password" Error
- Problem: `Attempting to update a non-mutable attribute` when changing password
- Solution: Filtered out `email` attribute from `userAttributes` before calling `completeNewPasswordChallenge`

# 6. Database Connection Timeout
- Problem: `ETIMEDOUT` errors when connecting to Azure SQL Database
- Solution: 
  - Updated `mssql` package to latest version
  - Increased connection timeout to 60 seconds
  - Ensured "Allow Azure services" firewall rule was enabled

# 7. RabbitMQ Connection Errors
- Problem: Notification Service crashing due to RabbitMQ connection failures
- Solution: Implemented robust error handling with retry mechanism (every 5-10 seconds)

# 8. Email Delivery Issues**
- Problem: Welcome emails not arriving in inbox
- Solution: 
  - Verified Gmail App Password configuration
  - Added error logging
  - Emails may go to spam folder (user should check)

# 9. Flexible Dates & Direct Flights Backend Implementation**
- Problem: Frontend had checkboxes but backend didn't process them
- Solution: 
  - Implemented ±3 days date range for flexible dates
  - Added duration-based heuristic for direct flights (< 6 hours)

---

# Data Models (ER Diagram)

# Entity Relationship Diagram

```
┌─────────────────┐
│     flights     │
├─────────────────┤
│ PK id           │
│    flight_code  │ (UNIQUE)
│    from_city    │
│    to_city      │
│    flight_date  │
│    duration     │
│    price        │
│    capacity     │
│    booked_seats │
│    created_at   │
└────────┬────────┘
         │
         │ 1:N
         │
         ▼
┌─────────────────┐
│    bookings     │
├─────────────────┤
│ PK id           │
│ FK flight_id    │──┐
│    user_id      │  │
│    miles_smiles │  │
│      _number    │  │
│    passenger_   │  │
│      name       │  │
│    passenger_   │  │
│      surname    │  │
│    passenger_dob│  │
│    booking_date │  │
│    paid_with_   │  │
│      points     │  │
│    points_used  │  │
└─────────────────┘  │
                      │
┌─────────────────┐  │
│miles_smiles_    │  │
│   members       │  │
├─────────────────┤  │
│ PK id           │  │
│    member_      │  │
│      number     │◄─┘ (UNIQUE)
│    user_id      │ (UNIQUE)
│    email        │
│    first_name   │
│    last_name    │
│    date_of_     │
│      birth      │
│    points_      │
│      balance    │
│    created_at   │
│    welcome_     │
│      email_sent │
└────────┬────────┘
         │
         │ 1:N
         │
         ▼
┌─────────────────┐
│miles_           │
│  transactions   │
├─────────────────┤
│ PK id           │
│ FK member_      │
│      number     │
│ FK flight_id    │ (nullable)
│    points       │
│    transaction_ │
│      date       │
│    transaction_ │
│      type       │
│    email_sent   │
│    created_at   │
└─────────────────┘
```

# Table Descriptions

# `flights`
Stores flight information including route, date, price, and capacity.
- Primary Key: `id` (auto-increment)
- Unique Constraint: `flight_code`
- Relationships: One-to-many with `bookings`

# `bookings`
Stores ticket booking information.
- Primary Key: `id` (auto-increment)
- Foreign Keys: 
  - `flight_id` → `flights.id`
  - `miles_smiles_number` → `miles_smiles_members.member_number` (nullable)
- **Relationships**: Many-to-one with `flights`, many-to-one with `miles_smiles_members`

# `miles_smiles_members`
Stores Miles&Smiles loyalty program member information.
- Primary Key: `id` (auto-increment)
- Unique Constraints: 
  - `member_number`
  - `user_id`
- Relationships: One-to-many with `bookings`, one-to-many with `miles_transactions`

# `miles_transactions`
Stores all miles transactions (earned, spent, external).
- Primary Key: `id` (auto-increment)
- Foreign Keys: 
  - `member_number` → `miles_smiles_members.member_number`
  - `flight_id` → `flights.id` (nullable, for external airline transactions)
- Transaction Types: `FLIGHT_COMPLETED`, `POINTS_USED`, `EXTERNAL_AIRLINE`

---

# Setup Instructions

# Prerequisites
- Node.js 18+
- Python 3.8+
- Azure SQL Database (or local SQL Server)
- AWS Cognito User Pool
- RabbitMQ (CloudAMQP or local)
- Gmail account with App Password

# Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ödev2
```

2. Install dependencies**:
```bash

cd api-gateway && npm install
cd ../flight-service && npm install
cd ../notification-service && npm install
cd ../ml-service && npm install

cd ../frontend && npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in each service directory
   - Configure database, AWS Cognito, RabbitMQ, and Gmail credentials

4. Initialize database:
   - Tables are auto-created on first service start
   - Or run: `cd flight-service && node init-db.js`

5. Train ML model** (optional):
```bash
cd ml-service
python3 train_model.py
```

6. Start services:
```bash
# Terminal 1: API Gateway
cd api-gateway && node server.js

# Terminal 2: Flight Service
cd flight-service && node server.js

# Terminal 3: Notification Service
cd notification-service && node server.js

# Terminal 4: ML Service
cd ml-service && node server.js

# Terminal 5: Frontend
cd frontend && npm start
```

---

# API Endpoints

# Flight Service
- `GET /api/v1/flights/search` - Search flights (with pagination, flexible dates, direct flights)
- `POST /api/v1/flights` - Add flight (Admin only)
- `GET /api/v1/flights/:id` - Get flight details
- `POST /api/v1/flights/:flightId/book` - Book a ticket
- `GET /api/v1/airports` - Get cached airport names
- `GET /api/v1/airlines` - Get cached airline names

# ML Service
- `POST /api/v1/predict` - Predict flight price

# Notification Service
- `POST /api/v1/miles/add-external` - Add miles from external airline (API key protected)
- `POST /api/v1/scheduler/nightly-tasks` - Run scheduled tasks (API key protected)

---

# Testing

# Manual Testing
1. Admin Login: Login with Admin role → Add flights
2. User Login: Login with User role → Search and book flights
3. Miles&Smiles: Create new member during booking → Check welcome email
4. Price Prediction: Use "Predict Price" button in Admin panel
5. Flexible Dates: Search with flexible dates checkbox → See ±3 days results
6. Direct Flights: Search with direct flights only → See filtered results

# API Testing
```bash
# Health check
curl http://localhost:3001/health

# Search flights
curl "http://localhost:3001/api/v1/flights/search?from=Bangalore&to=Chennai&departure_date=2026-01-15&passengers=1"

# Predict price
curl -X POST http://localhost:3001/api/v1/flights/predict-price \
  -H "Content-Type: application/json" \
  -d '{"duration":"2h 30m","from_city":"Bangalore","to_city":"Chennai","flight_date":"2026-01-15"}'
```

---

# Deployment

# Cloud Services Used
- Database: Azure SQL Database
- IAM: AWS Cognito
- Queue: RabbitMQ (CloudAMQP)
- Scheduler: Azure Logic Apps (configurable)
- Email: Gmail SMTP

# Deployment Steps
1. Deploy each service to Azure App Service (or AWS App Runner, GCP Cloud Run)
2. Configure environment variables in cloud platform
3. Set up cloud scheduler to call Notification Service endpoints
4. Configure CORS and firewall rules
5. Update frontend API URLs to production endpoints

---
