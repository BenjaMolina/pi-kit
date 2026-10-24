[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $AuthPath,

    [Parameter()]
    [string] $BaseUrl = 'http://127.0.0.1:20128',

    [Parameter()]
    [Security.SecureString] $Password
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-PlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString] $Value)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-ValidatedBaseUri {
    param([Parameter(Mandatory = $true)][string] $Value)

    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref] $uri)) {
        throw 'BaseUrl must be an absolute loopback HTTP URL.'
    }
    $isLoopback = $uri.Host -eq 'localhost' -or $uri.Host -eq '127.0.0.1' -or $uri.Host -eq '[::1]' -or $uri.Host -eq '::1'
    if ($uri.Scheme -ne 'http' -or -not $isLoopback -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or ($uri.AbsolutePath -ne '/' -and $uri.AbsolutePath -ne '')) {
        throw 'BaseUrl must be a loopback-only HTTP URL with no credentials, query, fragment, or non-root path.'
    }
    return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
}

try {
    $base = Get-ValidatedBaseUri -Value $BaseUrl
    if (-not (Test-Path -LiteralPath $AuthPath -PathType Leaf)) {
        throw 'AuthPath must point to an existing Codex auth.json file.'
    }

    $auth = Get-Content -LiteralPath $AuthPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $tokens = $auth.tokens
    if ($null -eq $tokens) {
        throw 'Auth file is missing the required Codex tokens.'
    }
    $accessProperty = $tokens.PSObject.Properties['access_token']
    $refreshProperty = $tokens.PSObject.Properties['refresh_token']
    $idProperty = $tokens.PSObject.Properties['id_token']
    $accessToken = if ($null -ne $accessProperty) { $accessProperty.Value } else { $null }
    $refreshToken = if ($null -ne $refreshProperty) { $refreshProperty.Value } else { $null }
    $idToken = if ($null -ne $idProperty) { $idProperty.Value } else { $null }
    if ($accessToken -isnot [string] -or [string]::IsNullOrWhiteSpace($accessToken)) {
        throw 'Auth file has a missing or invalid access_token value.'
    }
    if ($refreshToken -isnot [string] -or [string]::IsNullOrWhiteSpace($refreshToken)) {
        throw 'Auth file has a missing or invalid refresh_token value.'
    }
    if ($idToken -isnot [string] -or [string]::IsNullOrWhiteSpace($idToken)) {
        throw 'Auth file has a missing or invalid id_token value.'
    }

    if ($null -eq $Password) {
        $Password = Read-Host '9Router dashboard password' -AsSecureString
    }
    if ($null -eq $Password -or $Password.Length -eq 0) {
        throw 'A nonempty dashboard password is required.'
    }
    $plainPassword = ConvertTo-PlainText -Value $Password
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginUri = "$base/api/auth/login"
    $importUri = "$base/api/oauth/codex/bulk-import"

    try {
        $loginBody = @{ password = $plainPassword } | ConvertTo-Json -Compress
        $login = Invoke-RestMethod -Method Post -Uri $loginUri -WebSession $session -Body $loginBody -ContentType 'application/json' -MaximumRedirection 0 -ErrorAction Stop
    }
    catch {
        throw 'Dashboard login failed. Check the local 9Router dashboard and try again.'
    }
    finally {
        $loginBody = $null
        $plainPassword = $null
    }
    if ($null -eq $login -or $login.success -ne $true) {
        throw 'Dashboard login was rejected. Check the local 9Router dashboard and try again.'
    }
    $login = $null

    try {
        $payload = @{ accounts = @(@{ accessToken = $accessToken; refreshToken = $refreshToken; idToken = $idToken }) } | ConvertTo-Json -Depth 4 -Compress
        $importResult = Invoke-RestMethod -Method Post -Uri $importUri -WebSession $session -Body $payload -ContentType 'application/json' -MaximumRedirection 0 -ErrorAction Stop
        $successCount = $importResult.success
        $failedCount = $importResult.failed
        $results = @($importResult.results)
        $resultIndex = $null
        if ($results.Count -eq 1) {
            $resultIndex = $results[0].index
        }
        $indexIsInteger = ($resultIndex -is [int] -or $resultIndex -is [long])
        $successIsInteger = ($successCount -is [int] -or $successCount -is [long])
        $failedIsInteger = ($failedCount -is [int] -or $failedCount -is [long])
        if ($null -eq $importResult -or -not $successIsInteger -or $successCount -ne 1 -or
            -not $failedIsInteger -or $failedCount -ne 0 -or $results.Count -ne 1 -or
            -not $indexIsInteger -or $resultIndex -ne 0 -or $results[0].ok -ne $true -or
            [string]::IsNullOrWhiteSpace([string]$results[0].id)) {
            throw 'Import was not confirmed.'
        }
    }
    catch {
        throw 'The import result is uncertain. Check the 9Router dashboard before rerunning; do not retry automatically.'
    }
    finally {
        $payload = $null
        $importResult = $null
    }

    Write-Output 'Codex account import succeeded (1 account).'
}
catch {
    # Do not expose request/response bodies, tokens, passwords, or implementation exceptions.
    $safeMessage = $_.Exception.Message
    if ($safeMessage -notin @(
        'BaseUrl must be an absolute loopback HTTP URL.',
        'BaseUrl must be a loopback-only HTTP URL with no credentials, query, fragment, or non-root path.',
        'AuthPath must point to an existing Codex auth.json file.',
        'Auth file is missing the required Codex tokens.',
        'Auth file has a missing or invalid access_token value.',
        'Auth file has a missing or invalid refresh_token value.',
        'Auth file has a missing or invalid id_token value.',
        'A nonempty dashboard password is required.',
        'Dashboard login failed. Check the local 9Router dashboard and try again.',
        'Dashboard login was rejected. Check the local 9Router dashboard and try again.',
        'The import result is uncertain. Check the 9Router dashboard before rerunning; do not retry automatically.'
    )) {
        $safeMessage = 'Import failed before a request could be safely completed.'
    }
    throw "Codex account import failed: $safeMessage"
}
finally {
    $accessToken = $null
    $refreshToken = $null
    $idToken = $null
    $auth = $null
    $tokens = $null
    $Password = $null
}
