#!/bin/bash

# Exit on error
set -e

echo "Setting up application..."

# Install Node.js dependencies
echo "Installing Node.js backend dependencies..."
cd back-end
npm install
cd ..

# Install frontend dependencies and build
echo "Installing frontend dependencies and building..."
cd front-end
npm install
npm run build
cd ..

# Install Python dependencies
echo "Installing Python backend dependencies..."
cd python-backend
pip3 install -r requirements.txt
cd ..

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null
then
    echo "Installing PM2..."
    npm install -g pm2
fi

echo "Setup complete! To start the application, run: pm2 start ecosystem.config.js" 