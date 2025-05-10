# Deployment Guide

This guide will help you deploy the application on your Ubuntu server.

## Prerequisites

- Ubuntu 20.04 LTS or later
- Node.js 16+ installed
- Python 3.8+ installed
- Nginx (for reverse proxy)

## Deployment Steps

### 1. Clone the repository

```bash
git clone [your-repository-url]
cd [repository-directory]
```

### 2. Install dependencies and set up the application

Make the setup script executable and run it:

```bash
chmod +x setup.sh
./setup.sh
```

### 3. Start the application using PM2

```bash
pm2 start ecosystem.config.js
```

### 4. Set up PM2 to start on system boot

```bash
pm2 save
pm2 startup
```

Then run the command provided by PM2 to enable startup script.

### 5. Configure Nginx as a reverse proxy

Create a new Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/your-app
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or server IP

    location / {
        proxy_pass http://localhost:3000;  # Node.js backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/python/ {
        proxy_pass http://localhost:8000/;  # Python backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws/ {
        proxy_pass http://localhost:8000/ws/;  # Python WebSocket endpoint
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Set up SSL with Let's Encrypt (Optional but recommended)

```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 7. Monitoring and Managing the Application

- Check status: `pm2 status`
- View logs: `pm2 logs`
- Restart services: `pm2 restart all` or `pm2 restart [app-name]`
- Stop services: `pm2 stop all` or `pm2 stop [app-name]`

## Troubleshooting

### If the Node.js backend fails to start:

Check logs with `pm2 logs node-backend` and make sure the port is available.

### If the Python backend fails to start:

Check logs with `pm2 logs python-backend` and ensure all Python dependencies are properly installed.

### If Nginx shows errors:

Run `sudo nginx -t` to verify the configuration and check `/var/log/nginx/error.log` for details.
