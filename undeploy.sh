#!/bin/bash
# Independent Undeployment Script for Amazon Nova Sonic 2 Dating Agents

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/cdk"

echo "🗑️ Undeploying Amazon Nova Sonic 2 Dating Agents..."

# Verify AWS credentials
if ! aws sts get-caller-identity > /dev/null; then
    echo "❌ AWS credentials not found. Please run 'aws configure'."
    exit 1
fi

# Destroy resources
npx cdk destroy --force

# Remove the output file if it exists
if [ -f "output.json" ]; then
    rm output.json
    echo "🗑️ Removed output.json"
fi

echo "✅ Undeployment Complete!"
