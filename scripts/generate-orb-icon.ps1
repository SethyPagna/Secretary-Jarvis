param(
    [string]$PngPath = "assets/icon.png",
    [string]$IcoPath = "assets/icon.ico",
    [int]$Size = 1024
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
if (-not ("Win32.NativeMethods" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Win32 {
    public static class NativeMethods {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr hIcon);
    }
}
"@
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedPng = if ([IO.Path]::IsPathRooted($PngPath)) { $PngPath } else { Join-Path $RepoRoot $PngPath }
$resolvedIco = if ([IO.Path]::IsPathRooted($IcoPath)) { $IcoPath } else { Join-Path $RepoRoot $IcoPath }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedPng) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedIco) | Out-Null

function New-Color {
    param([int]$A, [int]$R, [int]$G, [int]$B)
    return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Lerp {
    param([double]$A, [double]$B, [double]$T)
    return [int][Math]::Round($A + (($B - $A) * $T))
}

$bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$center = $Size / 2.0
$orbRadius = $Size * 0.305

for ($i = 44; $i -ge 1; $i--) {
    $t = $i / 44.0
    $radius = $orbRadius + (($i * $Size) / 600.0)
    $alpha = [Math]::Max(0, [Math]::Round(36 * (1 - $t)))
    $brush = New-Object System.Drawing.SolidBrush (New-Color $alpha 0 212 255)
    $graphics.FillEllipse($brush, [float]($center - $radius), [float]($center - $radius), [float]($radius * 2), [float]($radius * 2))
    $brush.Dispose()
}

for ($i = 90; $i -ge 0; $i--) {
    $t = $i / 90.0
    $radius = $orbRadius * $t
    $r = Lerp 2 26 (1 - $t)
    $g = Lerp 30 218 (1 - $t)
    $b = Lerp 74 255 (1 - $t)
    $alpha = Lerp 230 255 (1 - $t)
    $brush = New-Object System.Drawing.SolidBrush (New-Color $alpha $r $g $b)
    $graphics.FillEllipse($brush, [float]($center - $radius), [float]($center - $radius), [float]($radius * 2), [float]($radius * 2))
    $brush.Dispose()
}

$shadowBrush = New-Object System.Drawing.SolidBrush (New-Color 110 2 8 28)
$graphics.FillEllipse($shadowBrush, [float]($center - ($orbRadius * 0.72)), [float]($center + ($orbRadius * 0.02)), [float]($orbRadius * 1.44), [float]($orbRadius * 0.95))
$shadowBrush.Dispose()

$rimPen = New-Object System.Drawing.Pen (New-Color 230 122 244 255), ([float]($Size * 0.014))
$graphics.DrawEllipse($rimPen, [float]($center - $orbRadius), [float]($center - $orbRadius), [float]($orbRadius * 2), [float]($orbRadius * 2))
$rimPen.Dispose()

$hotPen = New-Object System.Drawing.Pen (New-Color 210 255 102 0), ([float]($Size * 0.008))
$coldPen = New-Object System.Drawing.Pen (New-Color 220 0 244 255), ([float]($Size * 0.009))
$softPen = New-Object System.Drawing.Pen (New-Color 130 156 255 255), ([float]($Size * 0.004))

$arcRect1 = New-Object System.Drawing.RectangleF ([float]($center - ($orbRadius * 0.87))), ([float]($center - ($orbRadius * 0.72))), ([float]($orbRadius * 1.74)), ([float]($orbRadius * 1.44))
$arcRect2 = New-Object System.Drawing.RectangleF ([float]($center - ($orbRadius * 0.68))), ([float]($center - ($orbRadius * 0.92))), ([float]($orbRadius * 1.36)), ([float]($orbRadius * 1.84))
$arcRect3 = New-Object System.Drawing.RectangleF ([float]($center - ($orbRadius * 0.98))), ([float]($center - ($orbRadius * 0.40))), ([float]($orbRadius * 1.96)), ([float]($orbRadius * 0.80))

$graphics.DrawArc($coldPen, $arcRect1, 205, 106)
$graphics.DrawArc($hotPen, $arcRect2, 24, 58)
$graphics.DrawArc($softPen, $arcRect3, 16, 148)
$graphics.DrawArc($softPen, $arcRect3, 202, 112)

$nodeBrush = New-Object System.Drawing.SolidBrush (New-Color 245 213 252 255)
$amberBrush = New-Object System.Drawing.SolidBrush (New-Color 230 255 102 0)
$nodes = @(
    @(-0.56, -0.10, 0),
    @(-0.34, -0.42, 0),
    @(0.12, -0.56, 1),
    @(0.50, -0.18, 0),
    @(0.36, 0.35, 1),
    @(-0.18, 0.54, 0)
)

foreach ($node in $nodes) {
    $x = $center + ($orbRadius * [double]$node[0])
    $y = $center + ($orbRadius * [double]$node[1])
    $sizeNode = $Size * 0.030
    $brush = if ([int]$node[2] -eq 1) { $amberBrush } else { $nodeBrush }
    $graphics.FillEllipse($brush, [float]($x - ($sizeNode / 2)), [float]($y - ($sizeNode / 2)), [float]$sizeNode, [float]$sizeNode)
}

$nodeBrush.Dispose()
$amberBrush.Dispose()
$hotPen.Dispose()
$coldPen.Dispose()
$softPen.Dispose()

$highlightBrush = New-Object System.Drawing.SolidBrush (New-Color 118 245 255 255)
$graphics.FillEllipse($highlightBrush, [float]($center - ($orbRadius * 0.52)), [float]($center - ($orbRadius * 0.70)), [float]($orbRadius * 0.58), [float]($orbRadius * 0.32))
$highlightBrush.Dispose()

$graphics.Dispose()
$bitmap.Save($resolvedPng, [System.Drawing.Imaging.ImageFormat]::Png)

$iconSize = 256
$iconBitmap = New-Object System.Drawing.Bitmap $iconSize, $iconSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.Clear([System.Drawing.Color]::Transparent)
$iconGraphics.DrawImage($bitmap, 0, 0, $iconSize, $iconSize)
$iconGraphics.Dispose()

$iconHandle = $iconBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Open($resolvedIco, [System.IO.FileMode]::Create)
try {
    $icon.Save($stream)
}
finally {
    $stream.Dispose()
    $icon.Dispose()
    $nativeMethods = "Win32.NativeMethods" -as [type]
    if ($nativeMethods) {
        $nativeMethods::DestroyIcon($iconHandle) | Out-Null
    }
    $iconBitmap.Dispose()
    $bitmap.Dispose()
}

Write-Host "Generated $resolvedPng"
Write-Host "Generated $resolvedIco"
