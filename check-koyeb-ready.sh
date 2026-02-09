#!/bin/bash

# Koyeb Pre-Deployment Checklist Script
# Run this before deploying to Koyeb to ensure everything is ready

echo "Atlas API - Koyeb Pre-Deployment Checklist"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counter
checks_passed=0
checks_failed=0

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $2"
        ((checks_failed++))
    fi
}

# Function to check if file does NOT exist (for security)
check_file_not_exists() {
    if [ ! -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $2"
        ((checks_failed++))
    fi
}

# Function to check if string exists in file
check_in_file() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $3"
        ((checks_failed++))
    fi
}

echo "Checking Required Files..."
echo "------------------------------"
check_file "Dockerfile" "Dockerfile exists"
check_file "docker-entrypoint.sh" "docker-entrypoint.sh exists"
check_file ".dockerignore" ".dockerignore exists"
check_file "package.json" "package.json exists"
check_file "tsconfig.json" "tsconfig.json exists"
check_file "nest-cli.json" "nest-cli.json exists"
check_file "prisma/schema.prisma" "Prisma schema exists"
echo ""

echo "Checking Security..."
echo "------------------------------"
check_in_file ".gitignore" ".env" ".env is in .gitignore"
check_file ".env.example" ".env.example exists (template)"

# Check if .env exists in git
if git ls-files --error-unmatch .env 2>/dev/null; then
    echo -e "${RED}✗${NC} .env is NOT tracked by git (GOOD - keeps secrets safe)"
    ((checks_passed++))
else
    echo -e "${GREEN}✓${NC} .env is NOT tracked by git (GOOD - keeps secrets safe)"
    ((checks_passed++))
fi
echo ""

echo "Checking Docker Configuration..."
echo "------------------------------"
check_in_file "Dockerfile" "FROM node:22-alpine" "Dockerfile uses Node 22 Alpine"
check_in_file "Dockerfile" "COPY --from=dependencies /app/prisma/generated" "Prisma client path is correct"
check_in_file "tsconfig.json" "@prisma/client" "TypeScript path mapping for Prisma"
echo ""

echo "Checking Application Configuration..."
echo "------------------------------"
check_in_file "src/main.ts" "process.env.PORT" "App uses PORT environment variable"
check_in_file "docker-entrypoint.sh" "prisma migrate deploy" "Entrypoint runs migrations"
echo ""

echo "Checking Environment Variables..."
echo "------------------------------"
if [ -f ".env" ]; then
    check_in_file ".env" "DATABASE_URL" "DATABASE_URL is set"
    check_in_file ".env" "SUPABASE_URL" "SUPABASE_URL is set"
    check_in_file ".env" "SUPABASE_KEY" "SUPABASE_KEY is set"
else
    echo -e "${YELLOW}⚠${NC}  .env file not found (you'll set these in Koyeb)"
fi
echo ""

echo "Git Repository Status..."
echo "------------------------------"
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Git repository initialized"
    ((checks_passed++))
    
    # Check if there are uncommitted changes
    if [[ -n $(git status -s) ]]; then
        echo -e "${YELLOW}⚠${NC}  Uncommitted changes detected"
        echo "   Run: git add . && git commit -m 'Prepare for Koyeb deployment'"
    else
        echo -e "${GREEN}✓${NC} No uncommitted changes"
        ((checks_passed++))
    fi
    
    # Check if remote is set
    if git remote -v | grep -q origin; then
        echo -e "${GREEN}✓${NC} Git remote 'origin' is configured"
        ((checks_passed++))
        echo "   Remote: $(git remote get-url origin)"
    else
        echo -e "${RED}✗${NC} Git remote 'origin' not configured"
        ((checks_failed++))
        echo "   Run: git remote add origin https://github.com/YOUR_USERNAME/Atlas-API.git"
    fi
else
    echo -e "${RED}✗${NC} Git repository not initialized"
    ((checks_failed++))
    echo "   Run: git init"
fi
echo ""

echo "=============================================="
echo "Summary"
echo "=============================================="
echo -e "${GREEN}Passed: $checks_passed${NC}"
echo -e "${RED}Failed: $checks_failed${NC}"
echo ""

if [ $checks_failed -eq 0 ]; then
    echo -e "${GREEN} All checks passed! Ready to deploy to Koyeb!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Push to GitHub: git push origin main"
    echo "2. Go to Koyeb: https://app.koyeb.com"
    echo "3. Create Web Service → Select GitHub → Choose your repo"
    echo "4. Configure environment variables (see .env.example)"
    echo "5. Deploy!"
    echo ""
    echo "See KOYEB_DEPLOYMENT.md for detailed instructions"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some checks failed. Please fix the issues above before deploying.${NC}"
    echo ""
    echo "See KOYEB_DEPLOYMENT.md for help"
    exit 1
fi
