param(
    [string]$Title = "",
    [switch]$StillsOnly,
    [switch]$SkipSpeech
)

$ErrorActionPreference = "Stop"
$project = $PSScriptRoot
$scratch = Join-Path (Split-Path $project -Parent) ".hackathon\video"
New-Item -ItemType Directory -Force "$scratch\tmp", "$scratch\cache" | Out-Null
$env:TEMP = "$scratch\tmp"
$env:TMP = "$scratch\tmp"
$env:PYTHONPYCACHEPREFIX = "$scratch\cache\pycache"
$env:PIP_CACHE_DIR = "$scratch\cache\pip"
$env:PYTHONUTF8 = "1"
$renderArgs = @("$project\src\render.py")
if ($Title) { $renderArgs += @("--title", $Title) }
if ($StillsOnly) { $renderArgs += "--stills-only" }
if ($SkipSpeech) { $renderArgs += "--skip-speech" }
python @renderArgs
if ($LASTEXITCODE -ne 0) { throw "Video render failed with exit code $LASTEXITCODE" }
