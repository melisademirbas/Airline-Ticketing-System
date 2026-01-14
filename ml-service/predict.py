"""
Price prediction using trained model
Called from Node.js server
"""
import sys
import json
import pandas as pd
import joblib
import numpy as np
from datetime import datetime

def parse_duration(duration_str):
    """Parse duration string like '2h 30m' to total minutes"""
    if not duration_str:
        return 0
    duration_str = str(duration_str).lower().strip()
    hours = 0
    minutes = 0
    
    if 'h' in duration_str:
        hour_part = duration_str.split('h')[0]
        hours = int(hour_part) if hour_part.strip().isdigit() else 0
        if 'm' in duration_str:
            minute_part = duration_str.split('h')[1].split('m')[0]
            minutes = int(minute_part) if minute_part.strip().isdigit() else 0
    elif 'm' in duration_str:
        minute_part = duration_str.split('m')[0]
        minutes = int(minute_part) if minute_part.strip().isdigit() else 0
    
    return hours * 60 + minutes

def predict_price(duration, from_city, to_city, flight_date):
    try:
        # Load model and scaler
        model = joblib.load('models/price-prediction-model.pkl')
        scaler = joblib.load('models/scaler.pkl')
        
        # Load feature columns
        with open('models/feature_columns.json', 'r') as f:
            feature_columns = json.load(f)
        
        # Parse duration
        duration_minutes = parse_duration(duration)
        
        # Parse date
        date_obj = datetime.strptime(flight_date, '%Y-%m-%d')
        day_of_week = date_obj.weekday()
        month = date_obj.month
        
        # Create feature vector
        features = {}
        
        # Duration
        features['duration_minutes'] = duration_minutes
        
        # Days left (estimate based on date - for now use a default)
        features['days_left'] = max(1, (date_obj - datetime.now()).days)
        
        # Stops (default to zero for direct flights)
        features['stops_zero'] = 1
        features['stops_one'] = 0
        features['stops_two_or_more'] = 0
        
        # Class (default to Economy)
        features['class_Economy'] = 1
        features['class_Business'] = 0
        
        # Route encoding
        try:
            route_encoder = joblib.load('models/route_encoder.pkl')
            route = f"{from_city}_{to_city}"
            try:
                route_encoded = route_encoder.transform([route])[0]
            except:
                # If route not in training data, use average encoding
                route_encoded = len(route_encoder.classes_) // 2 if hasattr(route_encoder, 'classes_') else 0
            features['route_encoded'] = route_encoded
        except:
            # If route encoder not found, use default
            features['route_encoded'] = 0
        
        # Departure time (default to Morning)
        for col in feature_columns:
            if col.startswith('departure_time_'):
                features[col] = 1 if col == 'departure_time_Morning' else 0
        
        # Airline (default to first airline in training)
        for col in feature_columns:
            if col.startswith('airline_'):
                features[col] = 0
        
        # Create feature array in correct order
        feature_array = []
        for col in feature_columns:
            value = features.get(col, 0)
            # Ensure numeric value
            if isinstance(value, (int, float)):
                feature_array.append(value)
            else:
                feature_array.append(0)
        
        # Scale features
        feature_array = np.array(feature_array).reshape(1, -1)
        scaled_features = scaler.transform(feature_array)
        
        # Predict
        prediction = model.predict(scaled_features)[0]
        
        return {
            'predicted_price': float(prediction),
            'duration_minutes': duration_minutes,
            'method': 'ml_model'
        }
    except Exception as e:
        # Fallback to simple heuristic
        duration_minutes = parse_duration(duration)
        base_price = 200
        duration_factor = duration_minutes * 2
        
        date_obj = datetime.strptime(flight_date, '%Y-%m-%d')
        day_of_week = date_obj.weekday()
        weekend_factor = 30 if day_of_week in [5, 6] else 0
        
        predicted_price = base_price + duration_factor + weekend_factor
        
        return {
            'predicted_price': float(predicted_price),
            'duration_minutes': duration_minutes,
            'method': 'heuristic',
            'error': str(e)
        }

if __name__ == '__main__':
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    
    result = predict_price(
        input_data['duration'],
        input_data['from_city'],
        input_data['to_city'],
        input_data['flight_date']
    )
    
    # Output result as JSON
    print(json.dumps(result))
