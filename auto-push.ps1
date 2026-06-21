# Git Auto-Push Script for Windows PowerShell
# This script monitors changes in this directory and automatically commits & pushes to GitHub.

Write-Host "=============================================" -ForegroundColor Green
Write-Host "          GIT AUTO-PUSH STARTED              " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "Watching directory: $PSScriptRoot" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop this script." -ForegroundColor Yellow
Write-Host "---------------------------------------------"

while ($true) {
    # Check if there are changes (modified, deleted, or untracked files)
    $status = git status --porcelain
    if ($status) {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - Changes detected!" -ForegroundColor Cyan
        
        # Check if remote origin is set
        $remote = git remote get-url origin 2>$null
        if (-not $remote) {
            Write-Host "[WARNING] No remote 'origin' is set. Cannot push!" -ForegroundColor Red
            Write-Host "Please run: git remote add origin <your-github-repo-url>" -ForegroundColor Yellow
        } else {
            Write-Host "Staging changes..." -ForegroundColor Gray
            git add .
            
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Host "Committing changes..." -ForegroundColor Gray
            git commit -m "Auto-commit: $timestamp"
            
            # Detect current branch name
            $branch = git branch --show-current
            if (-not $branch) { $branch = "main" }
            
            Write-Host "Pushing to origin $branch..." -ForegroundColor Green
            git push origin $branch
            
            Write-Host "Push complete! Monitoring for next changes..." -ForegroundColor Green
        }
        Write-Host "---------------------------------------------"
    }
    
    # Wait for 10 seconds
    Start-Sleep -Seconds 10
}
