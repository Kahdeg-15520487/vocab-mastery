#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."

# Wait for PostgreSQL to be ready
until PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d $POSTGRES_DB -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is up!"

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Run seed (optional, won't fail if already seeded)
echo "Seeding database (if needed)..."
npm run seed 2>/dev/null || echo "Seed skipped or already completed"

# Start the application
echo "Starting server..."
exec "$@"
