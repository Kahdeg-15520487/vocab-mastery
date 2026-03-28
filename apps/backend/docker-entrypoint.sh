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
cd /app/apps/backend
npx prisma migrate deploy

# Seed only if no users exist (first run)
USER_COUNT=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "No users found, seeding database..."
  npm run seed || echo "Seed completed with warnings"
else
  echo "Database already seeded ($USER_COUNT users), skipping seed."
fi

# Start the application
echo "Starting server..."
exec "$@"
