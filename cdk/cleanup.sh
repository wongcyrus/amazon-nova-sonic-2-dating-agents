#!/bin/bash

# CDK Cleanup Script
# This script removes compiled JavaScript and TypeScript declaration files
# from the lib and bin directories only, preserving all other files

set -e  # Exit on any error

echo "🧹 Starting CDK cleanup (lib and bin directories only)..."

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="$SCRIPT_DIR"

echo "📁 CDK Directory: $CDK_DIR"

# Function to safely remove files with confirmation
cleanup_files() {
    local pattern="$1"
    local description="$2"
    
    echo "🔍 Looking for $description..."
    
    # Find files matching the pattern only in lib and bin folders
    local files_to_delete=$(find "$CDK_DIR/lib" "$CDK_DIR/bin" -name "$pattern" \
        -type f 2>/dev/null)
    
    if [ -n "$files_to_delete" ]; then
        echo "📋 Files to delete:"
        echo "$files_to_delete" | sed 's/^/  /'
        
        if [ "$1" = "--force" ] || [ "$FORCE" = "true" ]; then
            echo "🗑️  Deleting $description..."
            echo "$files_to_delete" | xargs rm -f
            echo "✅ Deleted $description"
        else
            read -p "❓ Delete these files? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "🗑️  Deleting $description..."
                echo "$files_to_delete" | xargs rm -f
                echo "✅ Deleted $description"
            else
                echo "⏭️  Skipped $description"
            fi
        fi
    else
        echo "✨ No $description found"
    fi
    echo
}

# Check for command line arguments
FORCE=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE=true
    echo "🚀 Force mode enabled - no confirmation prompts"
    echo
fi

# Clean up compiled JavaScript files (excluding jest.config.js)
cleanup_files "*.js" "compiled JavaScript files"

# Clean up TypeScript declaration files
cleanup_files "*.d.ts" "TypeScript declaration files"

# Clean up JavaScript map files if any
cleanup_files "*.js.map" "JavaScript source map files"

# Clean up TypeScript build info files if any
cleanup_files "*.tsbuildinfo" "TypeScript build info files"

echo "🎉 CDK cleanup completed!"
echo
echo "💡 Tip: You can run 'npm run build' to regenerate the compiled files"
echo "💡 Use '--force' or '-f' flag to skip confirmation prompts"
