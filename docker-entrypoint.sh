#!/bin/sh
set -e

echo "Starting Atlas API..."

# Function to wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "Waiting for PostgreSQL to be ready..."
    
    # Extract host and port from DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    
    if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ]; then
        echo "Could not parse DATABASE_URL. Skipping database wait check."
        return 0
    fi
    
    echo "Checking database at $DB_HOST:$DB_PORT..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
            echo "PostgreSQL is ready!"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo "Attempt $attempt/$max_attempts - Database not ready yet..."
        sleep 2
    done
    
    echo "Database is not available after $max_attempts attempts"
    exit 1
}

# Function to run Prisma migrations
run_migrations() {
    echo "Running Prisma migrations..."
    
    if npx prisma migrate deploy; then
        echo "Migrations completed successfully!"
    else
        echo "Migration failed, but continuing..."
        # Don't exit - migrations might fail if already applied
    fi
}

# Function to generate Prisma client
generate_prisma_client() {
    echo "Generating Prisma Client..."
    
    if npx prisma generate; then
        echo "Prisma Client generated successfully!"
    else
        echo "Failed to generate Prisma Client"
        exit 1
    fi
}

# Main execution
main() {
    # Wait for database to be ready
    wait_for_postgres
    
    # Run migrations
    run_migrations
    
    # Generate Prisma client (in case schema changed)
    generate_prisma_client
    
    echo "Starting NestJS application..."
    echo "Port: ${PORT:-4000}"
    echo "Environment: ${NODE_ENV:-production}"
    
    # Start the application
    exec node dist/src/main.js
}

# Run main function
main
