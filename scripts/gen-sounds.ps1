function New-ToneWav {
    param(
        [string]$Path,
        [double]$Freq,
        [double]$Duration,
        [int]$SampleRate = 44100,
        [double]$Volume = 0.5
    )
    $samples = [int]($SampleRate * $Duration)
    $bytes = New-Object byte[] (44 + $samples * 2)

    [BitConverter]::GetBytes(0x46464952).CopyTo($bytes, 0)
    [BitConverter]::GetBytes(36 + $samples * 2).CopyTo($bytes, 4)
    [BitConverter]::GetBytes(0x45564157).CopyTo($bytes, 8)
    [BitConverter]::GetBytes(0x20746D66).CopyTo($bytes, 12)
    [BitConverter]::GetBytes(16).CopyTo($bytes, 16)
    [BitConverter]::GetBytes([int16]1).CopyTo($bytes, 20)
    [BitConverter]::GetBytes([int16]1).CopyTo($bytes, 22)
    [BitConverter]::GetBytes($SampleRate).CopyTo($bytes, 24)
    [BitConverter]::GetBytes($SampleRate * 2).CopyTo($bytes, 28)
    [BitConverter]::GetBytes([int16]2).CopyTo($bytes, 32)
    [BitConverter]::GetBytes([int16]16).CopyTo($bytes, 34)
    [BitConverter]::GetBytes(0x61746164).CopyTo($bytes, 36)
    [BitConverter]::GetBytes($samples * 2).CopyTo($bytes, 40)

    for ($i = 0; $i -lt $samples; $i++) {
        $t = $i / $SampleRate
        $env = [Math]::Max(0, 1 - ($t / $Duration))
        $val = $Volume * $env * [Math]::Sin(2 * [Math]::PI * $Freq * $t)
        $pcm = [int16]([Math]::Round($val * 32767))
        [BitConverter]::GetBytes($pcm).CopyTo($bytes, 44 + $i * 2)
    }

    [IO.File]::WriteAllBytes($Path, $bytes)
}

$dir = Join-Path $PSScriptRoot "..\sounds"

New-ToneWav -Path (Join-Path $dir "ding.wav") -Freq 880 -Duration 0.3 -Volume 0.6
New-ToneWav -Path (Join-Path $dir "alert.wav") -Freq 440 -Duration 0.5 -Volume 0.6
New-ToneWav -Path (Join-Path $dir "ping.wav") -Freq 1200 -Duration 0.15 -Volume 0.5

Write-Host "Generated 3 WAV files in $dir"
