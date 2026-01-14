FROM node:18-alpine

# Install Python and dependencies for ML training
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --production

COPY . .

# Create directories
RUN mkdir -p models data

EXPOSE 3003

CMD ["node", "server.js"]
