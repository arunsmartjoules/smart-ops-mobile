#!/bin/bash

# PowerSync Migration Completion Script
# This script completes the WatermelonDB to PowerSync + Drizzle migration

set -e

echo "🚀 Starting PowerSync Migration Completion..."
echo ""

# Step 1: Install new dependencies
echo "📦 Step 1: Installing PowerSync and Drizzle dependencies..."
npm install @powersync/react-native@^1.30.0 \
  @powersync/drizzle-driver@^0.7.0 \
  @powersync/op-sqlite@^0.2.0 \
  drizzle-orm@^0.36.0 \
  uuid@^11.0.3

npm install --save-dev @types/uuid@^10.0.0

echo "✅ Dependencies installed"
echo ""

# Step 2: Uninstall WatermelonDB
echo "🗑️  Step 2: Removing WatermelonDB..."
npm uninstall @nozbe/watermelondb @nozbe/with-observables || true

echo "✅ WatermelonDB removed"
echo ""

# Step 3: Remove legacy model files
echo "🧹 Step 3: Cleaning up legacy WatermelonDB models..."
if [ -d "database/models" ]; then
  rm -rf database/models
  echo "✅ Legacy models removed"
else
  echo "⚠️  No legacy models directory found (already cleaned)"
fi
echo ""

# Step 4: Clean iOS build artifacts
echo "🍎 Step 4: Cleaning iOS build artifacts..."
if [ -d "ios" ]; then
  cd ios
  rm -rf Pods Podfile.lock build
  echo "📦 Running pod install..."
  pod install || echo "⚠️  Pod install failed - you may need to run it manually"
  cd ..
  echo "✅ iOS cleaned"
else
  echo "⚠️  No ios directory found"
fi
echo ""

# Step 5: Clean Android build artifacts
echo "🤖 Step 5: Cleaning Android build artifacts..."
if [ -d "android" ]; then
  cd android
  ./gradlew clean || echo "⚠️  Gradle clean failed - you may need to run it manually"
  cd ..
  echo "✅ Android cleaned"
else
  echo "⚠️  No android directory found"
fi
echo ""

# Step 6: Clear Metro bundler cache
echo "🧹 Step 6: Clearing Metro bundler cache..."
npx react-native start --reset-cache &
METRO_PID=$!
sleep 3
kill $METRO_PID 2>/dev/null || true
echo "✅ Metro cache cleared"
echo ""

echo "✨ Migration completion script finished!"
echo ""
echo "📋 Next Steps:"
echo "1. Configure your backend PowerSync endpoint (/api/auth/powersync-token)"
echo "2. Set up PostgreSQL logical replication (wal_level = logical)"
echo "3. Deploy PowerSync sync rules (see MIGRATION_COMPLETION_GUIDE.md)"
echo "4. Test the app: npm run ios or npm run android"
echo ""
echo "📖 See MIGRATION_COMPLETION_GUIDE.md for detailed instructions"
