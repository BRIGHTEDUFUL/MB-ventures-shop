#!/bin/bash
#
# Production Environment Setup for Hostinger
# Run this script on the Hostinger VPS to configure all environment variables
#
# Usage: bash setup-production-env.sh
#

set -e

echo "================================================"
echo "MB Ventures GH - Production Environment Setup"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project directory (adjust if needed)
PROJECT_DIR="/var/www/mbventuresghana"
ENV_FILE="$PROJECT_DIR/.env.local"

echo -e "${YELLOW}Setting up production environment at:${NC}"
echo "$PROJECT_DIR"
echo ""

# Check if we're in the right directory
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo -e "${RED}Error: package.json not found in $PROJECT_DIR${NC}"
    echo "Please adjust PROJECT_DIR in this script"
    exit 1
fi

# Backup existing .env.local if it exists
if [ -f "$ENV_FILE" ]; then
    BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"
    echo -e "${YELLOW}Backing up existing .env.local to:${NC}"
    echo "$BACKUP_FILE"
    cp "$ENV_FILE" "$BACKUP_FILE"
    echo ""
fi

# Create the .env.local file
echo -e "${GREEN}Creating production .env.local file...${NC}"
cat > "$ENV_FILE" << 'EOF'
# ============================================
# MB Ventures GH - Production Environment
# Generated: 2025-01-10
# ============================================

# Convex Backend (Production Deployment)
VITE_CONVEX_URL=https://necessary-newt-861.convex.cloud

# Site Configuration
VITE_SITE_URL=https://mbventuresghana.com
NODE_ENV=production

# ============================================
# Email Configuration (Web3Forms)
# ============================================
WEB3FORMS_ACCESS_KEY=c8395fed-e25e-4350-a914-df8e592f5920
EMAIL_REPLY_TO=info@mbventuresghana.com
ADMIN_ALERT_EMAIL=info@mbventuresghana.com
EMAIL_DAILY_LIMIT=250

# ============================================
# Convex Auth (Production Keys)
# ============================================
# These are set directly in Convex dashboard
# JWT_PRIVATE_KEY - Set in Convex prod env
# JWKS - Set in Convex prod env
# SITE_URL - Set in Convex prod env

# ============================================
# Build Configuration
# ============================================
# No additional build vars needed - Vite picks up VITE_* at build time

EOF

echo -e "${GREEN}✓ .env.local file created${NC}"
echo ""

# Set proper permissions
chmod 600 "$ENV_FILE"
echo -e "${GREEN}✓ File permissions set (600)${NC}"
echo ""

# Verify the file
echo -e "${YELLOW}Current environment configuration:${NC}"
echo "--------------------------------------------"
cat "$ENV_FILE" | grep -E "^(VITE_|WEB3FORMS|EMAIL|NODE_ENV)" | grep -v "^#"
echo "--------------------------------------------"
echo ""

# Additional Convex environment check
echo -e "${YELLOW}Verifying Convex production environment variables...${NC}"
echo ""
echo "The following must be set in Convex dashboard for prod deployment:"
echo "https://dashboard.convex.dev/t/synthxos/shop/necessary-newt-861"
echo ""
echo "Required Convex Env Vars:"
echo "  • WEB3FORMS_ACCESS_KEY = c8395fed-e25e-4350-a914-df8e592f5920"
echo "  • EMAIL_REPLY_TO = info@mbventuresghana.com"
echo "  • ADMIN_ALERT_EMAIL = info@mbventuresghana.com"
echo "  • EMAIL_DAILY_LIMIT = 250"
echo "  • SITE_URL = https://mbventuresghana.com"
echo "  • JWT_PRIVATE_KEY = [Separate production key]"
echo "  • JWKS = [Separate production keys]"
echo ""

# Installation check
echo -e "${YELLOW}Checking Node.js and npm...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    echo "Install Node.js 20.x or higher"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
fi
echo ""

# PM2 check
echo -e "${YELLOW}Checking PM2...${NC}"
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✓ PM2 installed: $PM2_VERSION${NC}"
else
    echo -e "${RED}✗ PM2 not found${NC}"
    echo "Install with: npm install -g pm2"
fi
echo ""

# Next steps
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Environment setup complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Install dependencies:"
echo "   cd $PROJECT_DIR"
echo "   npm install"
echo ""
echo "2. Build the application:"
echo "   npm run build"
echo ""
echo "3. Start with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "4. Configure Nginx reverse proxy (see HOSTINGER-DEPLOYMENT.md)"
echo ""
echo "5. Enable SSL certificate (Let's Encrypt)"
echo ""
echo "6. Create admin and staff accounts:"
echo "   - Register at https://mbventuresghana.com/auth/signup"
echo "   - Grant privileges with Convex CLI (see docs/PRODUCTION-CREDENTIALS.md)"
echo ""
echo "7. Test the production site:"
echo "   - Sign in with admin account"
echo "   - Configure store settings"
echo "   - Set MoMo wallet details"
echo "   - Enable ordering"
echo ""
echo -e "${YELLOW}For detailed deployment instructions, see:${NC}"
echo "  • HOSTINGER-DEPLOYMENT.md"
echo "  • docs/PRODUCTION-CONFIG.md"
echo "  • docs/PRODUCTION-CREDENTIALS.md"
echo ""
