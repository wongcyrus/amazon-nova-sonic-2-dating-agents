#!/bin/bash
# Independent Deployment Script for Amazon Nova Sonic 2 Dating Agents

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/cdk"

echo "🚀 Deploying Amazon Nova Sonic 2 Dating Agents..."

# Verify AWS credentials
aws sts get-caller-identity > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ AWS credentials not found. Please run 'aws configure'."
    exit 1
fi

# Deploy
npx cdk deploy --require-approval never --outputs-file output.json

echo "✅ Deployment Complete!"
echo "🔗 Website URL can be found in cdk/output.json"
