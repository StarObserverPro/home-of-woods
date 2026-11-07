$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
$env:NO_COLOR = '1'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe).Source
$cachePath = Join-Path $projectRoot '.cache/local-server'
New-Item -ItemType Directory -Force -Path $cachePath | Out-Null
$mutex = [System.Threading.Mutex]::new($false, 'Local\HomeOfWoods5286')
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { exit 0 }
    Set-Location -LiteralPath $projectRoot
    while ($true) {
        $log = Join-Path $cachePath 'server.log'
        if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 5000000) {
            Move-Item -LiteralPath $log -Destination (Join-Path $cachePath 'server.previous.log') -Force
        }
        Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Starting Home of Woods on 127.0.0.1:5286"
        # Vite strictPort never takes over another process or chooses another port.
        try {
            & $nodePath (Join-Path $projectRoot 'node_modules/vite/bin/vite.js') --host 127.0.0.1 --port 5286 --strictPort >> $log 2>&1
        } catch {
            Add-Content -LiteralPath $log -Value $_.Exception.Message
        }
        Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Vite exited; retrying in 10 seconds."
        Start-Sleep -Seconds 10
    }
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
