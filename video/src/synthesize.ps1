param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$Voice = "Microsoft Zira",
    [int]$Rate = -1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$segments = Get-Content -LiteralPath $ScriptPath -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $available = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
    if ($available -contains $Voice) {
        $synth.SelectVoice($Voice)
    } elseif ($available -contains "Microsoft Zira Desktop") {
        $synth.SelectVoice("Microsoft Zira Desktop")
    } else {
        throw "Requested local voice is unavailable. Installed voices: $($available -join ', ')"
    }
    $synth.Rate = $Rate
    $synth.Volume = 100
    New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        24000,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    $index = 0
    foreach ($segment in $segments) {
        $file = Join-Path $OutputDirectory ("voice-{0:D2}.wav" -f $index)
        $synth.SetOutputToWaveFile($file, $format)
        $synth.Speak([string]$segment.text)
        $synth.SetOutputToNull()
        Write-Output ("Narration {0:D2}: {1}" -f $index, $segment.text)
        $index++
    }
} finally {
    $synth.Dispose()
}
