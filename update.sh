#!/bin/bash

# EAS Update Script for Jouleops Mobile App
# Usage: ./update.sh [preview|production] "Your update message"

CHANNEL=${1:-preview}
MESSAGE=${2:-"Bug fixes and improvements"}

echo "📱 Publishing EAS Update..."
echo "Channel: $CHANNEL"
echo "Message: $MESSAGE"
echo ""

# Run the update
eas update --channel "$CHANNEL" --message "$MESSAGE"

echo ""
echo "✅ Update published successfully!"
echo "Users on the '$CHANNEL' channel will receive this update on next app launch."
