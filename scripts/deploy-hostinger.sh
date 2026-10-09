#!/bin/bash

################################################################################
# Hostinger Deployment Script
# MB Ventures GH - Circle Shop Express
# 
# This script automates deployment updates to Hostinger VPS
# 
# Usage:
#   chmod +x scripts/deploy-hostinger.sh
#   ./scripts/deploy-hostinger.sh
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/mbventuresghana"
APP_NAME="mbventuresghana"
BACKUP_DIR="/root/backups"
DATE=$(date +%Y-%m-%d-%H%M)

echo -e "${BLUE}🚀 Starting deployment for MB Ventures GH...${NC}\n"

# Step 1: Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ Please run as root or with sudo${NC}"
  exit 1
fi

# Step 2: Navigate to project directory
echo -e "${YELLOW}📁 Navigating to project directory...${NC}"
cd "$PROJECT_DIR" || {
  echo -e "${RED}❌ Project directory not found: $PROJECT_DIR${NC}"
  exit 1
}

# Step 3: Check git status
echo -e "${YELLOW}📊 Checking git status...${NC}"
git status

# Step 4: Backup current deployment
echo -e "${YELLOW}💾 Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/app-$DATE.tar.gz" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.output \
  --exclude=logs \
  "$PROJECT_DIR"
echo -e "${GREEN}✅ Backup created: $BACKUP_DIR/app-$DATE.tar.gz${NC}"

# Step 5: Stash any local changes
echo -e "${YELLOW}📦 Stashing local changes (if any)...${NC}"
git stash

# Step 6: Pull latest changes
echo -e "${YELLOW}📥 Pulling latest changes from GitHub...${NC}"
git pull origin main || {
  echo -e "${RED}❌ Git pull failed${NC}"
  exit 1
}

# Step 7: Install/update dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install || {
  echo -e "${RED}❌ npm install failed${NC}"
  exit 1
}

# Step 8: Run tests (optional - comment out if taking too long)
# echo -e "${YELLOW}🧪 Running tests...${NC}"
# npm test || {
#   echo -e "${RED}❌ Tests failed${NC}"
#   exit 1
# }

# Step 9: Build application
echo -e "${YELLOW}🏗️  Building application...${NC}"
npm run build || {
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
}

# Step 10: Restart application with PM2
echo -e "${YELLOW}🔄 Restarting application...${NC}"
pm2 restart "$APP_NAME" || {
  echo -e "${RED}❌ PM2 restart failed${NC}"
  exit 1
}

# Step 11: Wait for application to start
echo -e "${YELLOW}⏳ Waiting for application to start...${NC}"
sleep 5

# Step 12: Check application status
echo -e "${YELLOW}📊 Checking application status...${NC}"
pm2 status "$APP_NAME"

# Step 13: Check if application is responding
echo -e "${YELLOW}🔍 Testing application response...${NC}"
if curl -f http://localhost:3000 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Application is responding${NC}"
else
  echo -e "${RED}⚠️  Warning: Application may not be responding on port 3000${NC}"
  echo -e "${YELLOW}Check logs: pm2 logs $APP_NAME${NC}"
fi

# Step 14: Clean old backups (keep last 7 days)
echo -e "${YELLOW}🧹 Cleaning old backups...${NC}"
find "$BACKUP_DIR" -name "app-*.tar.gz" -mtime +7 -delete
echo -e "${GREEN}✅ Old backups cleaned${NC}"

# Step 15: Display recent logs
echo -e "\n${BLUE}📋 Recent application logs:${NC}"
pm2 logs "$APP_NAME" --lines 20 --nostream

# Step 16: Summary
echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}\n"
echo -e "${BLUE}Summary:${NC}"
echo -e "  Backup: $BACKUP_DIR/app-$DATE.tar.gz"
echo -e "  Application: $APP_NAME"
echo -e "  Status: $(pm2 describe $APP_NAME | grep status | awk '{print $4}')"
echo -e "\n${BLUE}Useful commands:${NC}"
echo -e "  View logs:     ${YELLOW}pm2 logs $APP_NAME${NC}"
echo -e "  Monitor:       ${YELLOW}pm2 monit${NC}"
echo -e "  Restart:       ${YELLOW}pm2 restart $APP_NAME${NC}"
echo -e "  Stop:          ${YELLOW}pm2 stop $APP_NAME${NC}"
echo -e "  View status:   ${YELLOW}pm2 status${NC}"
echo -e "\n${GREEN}🎉 Your application is now live at: https://mbventuresghana.com${NC}\n"

exit 0
