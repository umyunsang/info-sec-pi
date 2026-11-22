param(
    [string]$Repo = $(if ($env:ISP_REPO) { $env:ISP_REPO } else { 'umyunsang/info-sec-pi' }),
    [string]$Ref,
    [switch]$Source,
    [switch]$Binary
)

$ErrorActionPreference = 'Stop'
if ($Source -and $Binary) { throw 'Choose -Source or -Binary.' }
if ($Ref -and $Ref -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$') { throw 'Use a release tag such as v0.3.0-alpha.4.' }

if ($Source) {
    $package = '@info-sec-pi/isp'
    if ($Ref) { $package += '@' + $Ref.Substring(1) }
    & npm.cmd install --global $package
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    return
}

if ($Repo -cnotmatch '^[0-9A-Za-z_.-]+/[0-9A-Za-z_.-]+$') { throw 'Set ISP_REPO or pass -Repo OWNER/REPO.' }
$nativeArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = switch ($nativeArch) {
    'AMD64' { 'x64' }
    'ARM64' { 'arm64' }
    default { throw "Unsupported CPU architecture: $nativeArch" }
}
$asset = "isp-windows-$arch.zip"
$base = "https://github.com/$Repo/releases/latest/download"
if ($Ref) { $base = "https://github.com/$Repo/releases/download/$Ref" }
$installRoot = Join-Path $env:LOCALAPPDATA 'isp'
$installDir = if ($env:ISP_INSTALL_DIR) { $env:ISP_INSTALL_DIR } else { Join-Path $installRoot 'bin' }
$releaseDir = Join-Path $installRoot 'releases'
$null = New-Item -ItemType Directory -Force -Path $installDir, $releaseDir
$installDir = (Resolve-Path -LiteralPath $installDir).Path
$nonce = [Guid]::NewGuid().ToString('N')
$download = Join-Path ([IO.Path]::GetTempPath()) "isp-$nonce"
$staging = Join-Path $releaseDir $nonce
$shim = Join-Path $installDir 'isp.cmd'
$pendingShim = Join-Path $installDir ".isp-$nonce.cmd"
$installed = $false

try {
    $null = New-Item -ItemType Directory -Path $download, $staging
    $archive = Join-Path $download $asset
    $checksumFile = "$archive.sha256"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $archive
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset.sha256" -OutFile $checksumFile
    $expected = ((Get-Content -LiteralPath $checksumFile -TotalCount 1) -split '\s+')[0]
    if ($expected -notmatch '^[0-9a-f]{64}$' -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
        throw 'The downloaded archive failed SHA-256 verification.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $staging
    $launcher = Join-Path $staging 'isp\bin\isp.cmd'
    $version = & $launcher --version
    if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'The packaged isp launcher did not start.' }
    if ($Ref -and "v$version" -cne $Ref) { throw 'The installed version does not match the requested tag.' }

    $shimContent = '@echo off', 'setlocal DisableDelayedExpansion', ('"%LOCALAPPDATA%\isp\releases\' + $nonce + '\isp\bin\isp.cmd" %*')
    [IO.File]::WriteAllLines($pendingShim, $shimContent, [Text.Encoding]::ASCII)
    if (Test-Path -LiteralPath $shim -PathType Leaf) { [IO.File]::Replace($pendingShim, $shim, $null) }
    else { [IO.File]::Move($pendingShim, $shim) }
    $installed = $true

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($userPath -split ';') -notcontains $installDir) {
        $newPath = (@($installDir, $userPath) | Where-Object { $_ }) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    }
    if (($env:Path -split ';') -notcontains $installDir) { $env:Path = "$installDir;$env:Path" }
    Write-Output "Installed isp $version at $shim"
} finally {
    if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download -Recurse -Force }
    if (Test-Path -LiteralPath $pendingShim) { Remove-Item -LiteralPath $pendingShim -Force }
    if (-not $installed -and (Test-Path -LiteralPath $staging)) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
