"""
Train a simple flight price prediction model using the clean_dataset.csv
This is a basic example - you can enhance it based on your dataset structure
"""
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

def parse_duration(duration_str):
    """Parse duration string like '2h 30m' to total minutes"""
    if pd.isna(duration_str):
        return 0
    duration_str = str(duration_str).lower()
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

def train_model():
    # Load dataset
    data_path = os.path.join('data', 'clean_dataset.csv')
    
    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found!")
        print("Please place your clean_dataset.csv file in the ml-service/data/ directory")
        return
    
    print("Loading dataset...")
    df = pd.read_csv(data_path)
    
    print(f"Dataset shape: {df.shape}")
    print(f"Columns: {df.columns.tolist()}")
    
    # Feature engineering based on actual dataset structure
    feature_columns = []
    
    # Duration: Convert hours to minutes (duration is in hours, e.g., 2.17 = 2h 10m)
    if 'duration' in df.columns:
        df['duration_minutes'] = df['duration'] * 60  # Convert hours to minutes
        feature_columns.append('duration_minutes')
    else:
        print("Warning: 'duration' column not found.")
        df['duration_minutes'] = 120  # Default 2 hours
        feature_columns.append('duration_minutes')
    
    # Days left (important feature for price prediction)
    if 'days_left' in df.columns:
        feature_columns.append('days_left')
    
    # Stops (zero, one, two_or_more)
    if 'stops' in df.columns:
        stops_dummies = pd.get_dummies(df['stops'], prefix='stops')
        df = pd.concat([df, stops_dummies], axis=1)
        feature_columns.extend(stops_dummies.columns.tolist())
    
    # Class (Economy, Business)
    if 'class' in df.columns:
        class_dummies = pd.get_dummies(df['class'], prefix='class')
        df = pd.concat([df, class_dummies], axis=1)
        feature_columns.extend(class_dummies.columns.tolist())
    
    # Route features (source_city and destination_city)
    if 'source_city' in df.columns and 'destination_city' in df.columns:
        df['route'] = df['source_city'].astype(str) + '_' + df['destination_city'].astype(str)
        # Use label encoding for routes (too many unique routes for one-hot)
        route_encoder = LabelEncoder()
        df['route_encoded'] = route_encoder.fit_transform(df['route'])
        feature_columns.append('route_encoded')
        # Save encoder for later use
        joblib.dump(route_encoder, 'models/route_encoder.pkl')
    
    # Departure time (Early_Morning, Morning, Afternoon, Evening, Night)
    if 'departure_time' in df.columns:
        time_dummies = pd.get_dummies(df['departure_time'], prefix='departure_time')
        df = pd.concat([df, time_dummies], axis=1)
        feature_columns.extend(time_dummies.columns.tolist())
    
    # Airline (optional, can be useful)
    if 'airline' in df.columns:
        airline_dummies = pd.get_dummies(df['airline'], prefix='airline')
        df = pd.concat([df, airline_dummies], axis=1)
        feature_columns.extend(airline_dummies.columns.tolist())
    
    # Prepare features and target
    X = df[feature_columns].fillna(0)
    
    # Find price column
    price_col = None
    for col in ['price', 'Price', 'PRICE', 'fare', 'Fare', 'FARE']:
        if col in df.columns:
            price_col = col
            break
    
    if price_col is None:
        print("Error: Price column not found!")
        print("Available columns:", df.columns.tolist())
        return
    
    y = df[price_col]
    
    # Remove any infinite or very large values
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)
    y = y.replace([np.inf, -np.inf], np.nan).dropna()
    X = X.loc[y.index]
    
    print(f"Features shape: {X.shape}")
    print(f"Target shape: {y.shape}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model
    print("Training model...")
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train_scaled, y_train)
    
    # Evaluate
    train_score = model.score(X_train_scaled, y_train)
    test_score = model.score(X_test_scaled, y_test)
    
    print(f"Train R² score: {train_score:.4f}")
    print(f"Test R² score: {test_score:.4f}")
    
    # Save model and scaler
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/price-prediction-model.pkl')
    joblib.dump(scaler, 'models/scaler.pkl')
    
    print("Model saved to models/price-prediction-model.pkl")
    print("Scaler saved to models/scaler.pkl")
    
    # Save feature columns and encoders for later use
    import json
    with open('models/feature_columns.json', 'w') as f:
        json.dump(feature_columns, f)
    
    print(f"Feature columns ({len(feature_columns)}): {feature_columns[:10]}...")  # Show first 10
    print("Training completed!")

if __name__ == '__main__':
    train_model()
