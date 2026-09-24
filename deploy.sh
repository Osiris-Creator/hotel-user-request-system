#!/bin/bash

# Deploy script for Hotel User Request System
# Run this script to deploy both Worker and Pages to Cloudflare

set -e

echo "🚀 Starting deployment..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler is not installed. Installing..."
    npm install -g wrangler
fi

# Deploy Worker
echo ""
echo "📦 Deploying Worker (Backend)..."
wrangler deploy

# Deploy Pages
echo ""
echo "🌐 Deploying Pages (Frontend)..."
wrangler pages deploy public --project-name=hotel-request-ui

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "URLs:"
echo "  Worker: https://hotel-user-request-system.avanivacationclubsamui1.workers.dev"
echo "  Pages: https://hotel-request-ui.pages.dev"
