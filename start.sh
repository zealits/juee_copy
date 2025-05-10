#!/bin/bash

# Start both backends using PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js

# Display status
echo "Application started. Current status:"
pm2 status

echo "To monitor logs in real-time, run: pm2 logs"
echo "To stop the application, run: pm2 stop all" 