#!/bin/bash
#
# Complete Hostinger Deployment Script
# Run this on the Hostinger server after connecting via SSH or web terminal
#
# Usage: bash deploy-to-hostinger.sh
#

set -e

echo "============================================"
echo "MB Ventures GH - Hostinger Deployment"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/mbventuresghana"
GITHUB_REPO="https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git"

echo -e "${YELLOW}Step 1: Checking system...${NC}"
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    echo "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt install -y nodejs
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi

# Check PM2
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✓ PM2 installed: $PM2_VERSION${NC}"
else
    echo -e "${YELLOW}Installing PM2 globally...${NC}"
    sudo npm install -g pm2
fi

echo ""
echo -e "${YELLOW}Step 2: Setting up project directory...${NC}"
echo ""

# Check if project exists
if [ -d "$PROJECT_DIR" ]; then
    echo -e "${GREEN}✓ Project directory exists${NC}"
    cd "$PROJECT_DIR"
    
    # Pull latest changes
    echo "Pulling latest changes from GitHub..."
    git pull origin main
else
    echo -e "${YELLOW}Creating project directory...${NC}"
    sudo mkdir -p /var/www
    cd /var/www
    
    # Clone repository
    echo "Cloning repository from GitHub..."
    sudo git clone "$GITHUB_REPO" mbventuresghana
    cd mbventuresghana
fi

echo ""
echo -e "${YELLOW}Step 3: Setting up environment variables...${NC}"
echo ""

# Run environment setup script
if [ -f "scripts/setup-production-env.sh" ]; then
    chmod +x scripts/setup-production-env.sh
    bash scripts/setup-production-env.sh
else
    echo -e "${RED}✗ Environment setup script not found${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 4: Installing dependencies...${NC}"
echo ""

npm install

echo ""
echo -e "${YELLOW}Step 5: Building application...${NC}"
echo ""

npm run build

# Check if build succeeded
if [ -d ".output" ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 6: Starting application with PM2...${NC}"
echo ""

# Check if PM2 process exists
if pm2 list | grep -q "mb-ventures-gh"; then
    echo "Restarting existing PM2 process..."
    pm2 restart mb-ventures-gh
else
    echo "Starting new PM2 process..."
    pm2 start ecosystem.config.js
fi

# Save PM2 configuration
pm2 save

# Setup PM2 startup (if not already done)
if ! systemctl is-enabled pm2-root &> /dev/null; then
    echo "Setting up PM2 auto-start..."
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
fi

echo ""
echo -e "${YELLOW}Step 7: Checking application status...${NC}"
echo ""

pm2 status
pm2 logs mb-ventures-gh --lines 20 --nostream

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Application Status:"
pm2 list | grep mb-ventures-gh || echo "Process not found"
echo ""
echo "Next steps:"
echo "1. Configure Nginx reverse proxy (if not done)"
echo "2. Set up SSL certificate (if not done)"
echo "3. Register admin and staff accounts"
echo "4. Grant staff privileges via Convex CLI"
echo "5. Configure store settings in admin panel"
echo ""
echo "To view logs:"
echo "  pm2 logs mb-ventures-gh"
echo ""
echo "To restart:"
echo "  pm2 restart mb-ventures-gh"
echo ""
echo "To stop:"
echo "  pm2 stop mb-ventures-gh"
echo ""
echo "Production site should be available at:"
echo "  https://mbventuresghana.com"
echo ""
