#!/bin/bash
# Independent Deployment Script for Amazon Nova Sonic 2 Dating Agents

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/cdk"

echo "🚀 Deploying Amazon Nova Sonic 2 Dating Agents..."

# Verify AWS credentials
if ! aws sts get-caller-identity > /dev/null; then
    echo "❌ AWS credentials not found. Please run 'aws configure'."
    exit 1
fi

# Deploy
npx cdk deploy --require-approval never --outputs-file output.json

echo "✅ Deployment Complete!"
echo "🔗 Website URL can be found in cdk/output.json"
