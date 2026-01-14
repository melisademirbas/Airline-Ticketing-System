const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Check if model exists
const checkModel = () => {
  const modelPath = path.join(__dirname, 'models', 'price-prediction-model.pkl');
  return fs.existsSync(modelPath);
};

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ml-service',
    model_loaded: checkModel()
  });
});

// Price prediction using trained ML model
app.post('/api/v1/predict', async (req, res) => {
  try {
    const { duration, from_city, to_city, flight_date } = req.body;

    if (!duration || !from_city || !to_city || !flight_date) {
      return res.status(400).json({ error: 'Duration, from_city, to_city, and flight_date are required' });
    }

    // Check if model exists
    if (!checkModel()) {
      // Fallback to simple heuristic
      const durationMatch = duration.match(/(\d+)h\s*(\d+)m/);
      let totalMinutes = 0;
      if (durationMatch) {
        totalMinutes = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
      } else {
        const hourMatch = duration.match(/(\d+)h/);
        if (hourMatch) {
          totalMinutes = parseInt(hourMatch[1]) * 60;
        }
      }

      const basePrice = 200;
      const durationFactor = totalMinutes * 2;
      const date = new Date(flight_date);
      const dayOfWeek = date.getDay();
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 30 : 0;
      const predictedPrice = Math.round(basePrice + durationFactor + weekendFactor);

      return res.json({ 
        predicted_price: predictedPrice,
        duration_minutes: totalMinutes,
        method: 'heuristic_fallback'
      });
    }

    // Use Python script for prediction
    const inputData = JSON.stringify({
      duration,
      from_city,
      to_city,
      flight_date
    });

    const scriptPath = path.join(__dirname, 'predict.py');
    
    // Use spawn for better stdin handling
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('error', (error) => {
        console.error('Python process error:', error);
        reject(error);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            console.error('Error parsing Python output:', parseError);
            console.error('Stdout:', stdout);
            reject(parseError);
          }
        } else {
          console.error('Python script exited with code:', code);
          console.error('Stderr:', stderr);
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      // Send input data to Python script
      pythonProcess.stdin.write(inputData);
      pythonProcess.stdin.end();
    }).then((result) => {
      res.json(result);
    }).catch((error) => {
      console.error('Error executing Python script:', error);
      // Fallback to simple heuristic
      const durationMatch = duration.match(/(\d+)h\s*(\d+)m/);
      let totalMinutes = 0;
      if (durationMatch) {
        totalMinutes = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
      } else {
        const hourMatch = duration.match(/(\d+)h/);
        if (hourMatch) {
          totalMinutes = parseInt(hourMatch[1]) * 60;
        }
      }

      const basePrice = 200;
      const durationFactor = totalMinutes * 2;
      const date = new Date(flight_date);
      const dayOfWeek = date.getDay();
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 30 : 0;
      const predictedPrice = Math.round(basePrice + durationFactor + weekendFactor);

      res.json({ 
        predicted_price: predictedPrice,
        duration_minutes: totalMinutes,
        method: 'heuristic_fallback',
        error: error.message
      });
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`ML Service running on port ${PORT}`);
  if (checkModel()) {
    console.log('ML model found and ready for predictions');
  } else {
    console.log('Warning: ML model not found. Using heuristic fallback.');
  }
});
