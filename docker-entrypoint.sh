#!/bin/sh
set -e

# Which role this container plays: "api" (default) or "worker". Set via the
# first CMD arg — see docker-compose.yml's `worker` service. Only the api
# role runs migrations, so two containers starting at once can never race
# to apply the same migration.
ROLE="${1:-api}"

echo "Starting Atlas API (role: $ROLE)..."

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

# Function to wait for Redis to be ready
wait_for_redis() {
    echo "Waiting for Redis to be ready..."

    # Prefer REDIS_HOST/REDIS_PORT; fallback to REDIS_URL parsing
    REDIS_CHECK_HOST="${REDIS_HOST}"
    REDIS_CHECK_PORT="${REDIS_PORT}"

    if [ -z "$REDIS_CHECK_HOST" ] || [ -z "$REDIS_CHECK_PORT" ]; then
        REDIS_CHECK_HOST=$(echo $REDIS_URL | sed -n 's#redis://\([^:/]*\).*#\1#p')
        REDIS_CHECK_PORT=$(echo $REDIS_URL | sed -n 's#redis://[^:]*:\([0-9]*\).*#\1#p')
    fi

    if [ -z "$REDIS_CHECK_HOST" ]; then
        REDIS_CHECK_HOST="localhost"
    fi
    if [ -z "$REDIS_CHECK_PORT" ]; then
        REDIS_CHECK_PORT="6379"
    fi

    echo "Checking redis at $REDIS_CHECK_HOST:$REDIS_CHECK_PORT..."

    max_attempts=30
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if nc -z "$REDIS_CHECK_HOST" "$REDIS_CHECK_PORT" 2>/dev/null; then
            echo "Redis is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "Attempt $attempt/$max_attempts - Redis not ready yet..."
        sleep 2
    done

    echo "Redis is not available after $max_attempts attempts"
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

# Sentinel file that tells the supervisors to stop relaunching children once
# the container has been asked to shut down (vs. an ordinary crash).
STOP_SENTINEL="/tmp/atlas-shutting-down"

# Supervise a single long-running process: start it, and whenever it exits for
# any reason OTHER than a requested shutdown, restart it after a short backoff.
# Runs as its own background subshell (one per process), so a crash of one
# process restarts only that one — the other keeps serving.
#
# On container stop, dumb-init forwards TERM to the whole process group; the
# trap here records the shutdown, forwards TERM to the child for a graceful
# exit, and the loop then falls through instead of relaunching.
supervise() {
    label="$1"
    shift
    child=""
    trap 'touch "$STOP_SENTINEL"; [ -n "$child" ] && kill "$child" 2>/dev/null' TERM INT

    while [ ! -f "$STOP_SENTINEL" ]; do
        echo "[$label] starting..."
        "$@" &
        child=$!
        wait "$child"
        code=$?
        [ -f "$STOP_SENTINEL" ] && break
        echo "[$label] exited (code $code) — restarting in 3s..."
        sleep 3
    done
    echo "[$label] stopped."
}

# Run the API and the worker together in one container, each independently
# supervised (auto-restart on crash). Migrations run once here, same as the
# api role. Use when you'd rather pay for a single service than a separate
# worker; for isolation/independent scaling, run 'api' and 'worker' separately.
run_combined() {
    rm -f "$STOP_SENTINEL"
    run_migrations
    generate_prisma_client

    echo "Starting API + worker in one container (role: all)..."
    echo "Port: ${PORT:-4000}"
    echo "Environment: ${NODE_ENV:-production}"

    supervise "api" node dist/src/main.js &
    sup_api=$!
    supervise "worker" node dist/src/worker.js &
    sup_worker=$!

    # Forward container stop to both supervisors (belt-and-suspenders alongside
    # dumb-init's process-group signalling), then wait for them to wind down.
    trap 'touch "$STOP_SENTINEL"; kill "$sup_api" "$sup_worker" 2>/dev/null' TERM INT

    wait "$sup_api" "$sup_worker"
    echo "Both processes stopped — exiting."
}

# Main execution
main() {
    # Wait for database to be ready
    wait_for_postgres

    # Wait for redis to be ready
    wait_for_redis

    if [ "$ROLE" = "api" ]; then
        # Only the api container runs migrations — avoids two containers
        # (api + worker) racing to apply the same migration on startup.
        run_migrations
        generate_prisma_client

        echo "Starting NestJS API..."
        echo "Port: ${PORT:-4000}"
        echo "Environment: ${NODE_ENV:-production}"
        exec node dist/src/main.js
    elif [ "$ROLE" = "worker" ]; then
        generate_prisma_client

        echo "Starting background worker..."
        echo "Environment: ${NODE_ENV:-production}"
        exec node dist/src/worker.js
    elif [ "$ROLE" = "all" ]; then
        # API + worker in one container, each auto-restarted on crash.
        run_combined
    else
        echo "Unknown ROLE '$ROLE' — expected 'api', 'worker', or 'all'."
        exit 1
    fi
}

# Run main function
main
