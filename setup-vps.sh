#!/bin/bash

# =============================================
# Discord Member Analytics - VPS Setup Script
# =============================================

echo "╔════════════════════════════════════════════╗"
echo "║  Discord Analytics - VPS Setup Script      ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}Warning: Running as root. Consider using a regular user.${NC}"
fi

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js not found!${NC}"
    echo "Install Node.js with:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ package.json not found!${NC}"
    echo "Please run this script from the discord-server-scraper directory."
    exit 1
fi

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Checking .env file..."

if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    # Check if USER_TOKEN is set
    if grep -q "USER_TOKEN=." .env; then
        echo -e "${GREEN}✓ USER_TOKEN is configured${NC}"
    else
        echo -e "${YELLOW}! USER_TOKEN not set in .env${NC}"
    fi
    
    # Check if SERVER_ID is set
    if grep -q "SERVER_ID=." .env; then
        echo -e "${GREEN}✓ SERVER_ID is configured${NC}"
    else
        echo -e "${YELLOW}! SERVER_ID not set in .env${NC}"
    fi
else
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo ""
    echo -e "${YELLOW}Please edit .env file and add your configuration:${NC}"
    echo "  nano .env"
    echo ""
    echo "Required settings:"
    echo "  USER_TOKEN=your_discord_token_here"
    echo "  SERVER_ID=target_server_id"
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║             Setup Complete!                ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your Discord token and server ID"
echo "  2. Edit analyze-members.js with your channel IDs"
echo "  3. Run: npm run analyze"
echo ""
echo "Useful commands:"
echo "  npm run analyze   - Run member activity analysis"
echo "  npm run channels  - List all channels in server"
echo "  npm run start     - Scrape all server data"
echo ""
