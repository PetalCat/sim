# PowerShell deployment script for production
# Run this on your Windows server

Write-Host "Starting Fingerprint Sim deployment..." -ForegroundColor Cyan

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "        Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "[WARNING] .env not found. Creating from example..." -ForegroundColor Yellow
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Host "Please edit .env and set your environment variables before continuing." -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] .env.example not found. Please create .env manually." -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "After editing, run this script again." -ForegroundColor Cyan
    exit 1
}

# Create data directory for database
if (-not (Test-Path data)) {
    Write-Host "Creating data directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path data | Out-Null
}

# Build the Docker image
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed. Please check the errors above." -ForegroundColor Red
    exit 1
}

# Start the application
Write-Host "Starting application..." -ForegroundColor Cyan
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start application. Please check the errors above." -ForegroundColor Red
    exit 1
}

# Wait a moment for the container to start
Start-Sleep -Seconds 5

# Check if container is running
$containerStatus = docker-compose ps --format json | ConvertFrom-Json
$isRunning = $containerStatus | Where-Object { $_.State -eq "running" }

if ($isRunning) {
    Write-Host "[SUCCESS] Application started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Container status:" -ForegroundColor Cyan
    docker-compose ps
    Write-Host ""
    Write-Host "To view logs, run: docker-compose logs -f" -ForegroundColor Yellow
    Write-Host "Application should be available at: http://localhost:4000" -ForegroundColor Yellow
} else {
    Write-Host "[ERROR] Application failed to start. Checking logs..." -ForegroundColor Red
    docker-compose logs
}
