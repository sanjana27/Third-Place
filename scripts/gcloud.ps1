param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GcloudArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdk = Join-Path $root '.hackathon\tools\google-cloud-sdk\bin\gcloud.cmd'
if (-not (Test-Path -LiteralPath $sdk)) {
    throw 'The project-local Google Cloud SDK is missing from .hackathon\tools.'
}
$settings = @{
    CLOUDSDK_CONFIG = Join-Path $root '.hackathon\gcloud'
    CLOUDSDK_CORE_DISABLE_USAGE_REPORTING = 'true'
    CLOUDSDK_PAGER = ''
}
$original = @{}
foreach ($name in $settings.Keys) {
    $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
}
try {
    & $sdk @GcloudArgs
    $result = $LASTEXITCODE
}
finally {
    foreach ($name in $settings.Keys) {
        [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process')
    }
}
exit $result
