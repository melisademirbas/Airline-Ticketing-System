# Dataset Directory

## Instructions

1. Extract your archive file that contains the dataset
2. Find the `clean_dataset.csv` file inside the archive
3. Copy `clean_dataset.csv` to this directory (`ml-service/data/`)
4. The file should be named exactly: `clean_dataset.csv`

## Training the Model

After placing the dataset file here, run:

```bash
cd ml-service
pip install -r requirements.txt
python train_model.py
```

This will:
- Load the dataset
- Train a Random Forest regression model
- Save the model to `ml-service/models/price-prediction-model.pkl`
- Save the scaler to `ml-service/models/scaler.pkl`
- Save feature columns to `ml-service/models/feature_columns.json`

## Expected Dataset Format

The training script expects columns like:
- `duration` or similar (flight duration)
- `price` or `Price` or `fare` (target variable)
- `from` / `to` or `from_city` / `to_city` (route information)
- `date` or `flight_date` (date information)

The script will automatically adapt to your dataset structure, but you may need to adjust `train_model.py` if your column names are significantly different.
