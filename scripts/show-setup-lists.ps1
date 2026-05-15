param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"

$FeatureDownloads = @(
  [pscustomobject]@{
    Category = "voice"
    Name = "Piper executable and one local voice"
    Purpose = "Fast fully local TTS for Jarvis and agent voices"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\tools\piper"
  },
  [pscustomobject]@{
    Category = "voice"
    Name = "Wake-word profile"
    Purpose = "Wake the HUD by saying Jarvis"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\wake-word"
  },
  [pscustomobject]@{
    Category = "voice"
    Name = "Vosk streaming STT model"
    Purpose = "Low-latency fallback STT when Whisper is too heavy"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\vosk"
  },
  [pscustomobject]@{
    Category = "vision"
    Name = "LLaVA-style image model"
    Purpose = "Dedicated screen/image understanding if Qwen/Gemma runtime is not enough"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\huggingface\snapshots\llava"
  },
  [pscustomobject]@{
    Category = "vision"
    Name = "YOLO object detection weights"
    Purpose = "Fast local object detection for screen/camera frames"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\vision\yolo"
  },
  [pscustomobject]@{
    Category = "vision"
    Name = "OCR runtime"
    Purpose = "Read text from screenshots, PDFs, and app windows"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\tools\ocr"
  },
  [pscustomobject]@{
    Category = "media"
    Name = "Local image generation/editing model"
    Purpose = "Media Studio image generation and inpainting"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\media\image"
  },
  [pscustomobject]@{
    Category = "media"
    Name = "Local video generation/editing model"
    Purpose = "Media Studio video workflows"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\media\video"
  },
  [pscustomobject]@{
    Category = "media"
    Name = "Local music/song/audio model"
    Purpose = "Music, song, and rich audio generation"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\models\media\music"
  },
  [pscustomobject]@{
    Category = "maps"
    Name = "Offline maps/geocoder data"
    Purpose = "Local Map Room routing without hosted map APIs"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\data\maps"
  },
  [pscustomobject]@{
    Category = "connector"
    Name = "Connector credentials"
    Purpose = "Approved email/social/device actions"
    ExpectedPath = "C:\Users\user\Downloads\Secretary Jarvis\jarvis\data\vault"
  }
)

$FutureScaling = @(
  [pscustomobject]@{
    Name = "DeepSeek V4 Flash"
    ModelRef = "deepseek-ai/DeepSeek-V4-Flash"
    Scale = "homelab"
    Purpose = "Optional top-tier model switching when multi-GPU serving is available"
  },
  [pscustomobject]@{
    Name = "Larger DeepSeek/Qwen/Gemma/Llama reasoning models"
    ModelRef = "future/local-reasoning-family"
    Scale = "homelab"
    Purpose = "Optional later reasoning/coding scale-up"
  },
  [pscustomobject]@{
    Name = "Workstation/homelab multimodal models"
    ModelRef = "future/local-multimodal-family"
    Scale = "workstation"
    Purpose = "Optional stronger image/audio/video reasoning"
  },
  [pscustomobject]@{
    Name = "Large media generation models"
    ModelRef = "future/local-media-family"
    Scale = "homelab"
    Purpose = "Optional heavy image/video/audio/music generation"
  }
)

if ($Json) {
  [pscustomobject]@{
    NeededFeatureDownloads = $FeatureDownloads
    FutureScalingModels = $FutureScaling
  } | ConvertTo-Json -Depth 4
  exit 0
}

Write-Host ""
Write-Host "Needed feature downloads"
Write-Host "These are tools/models Jarvis is already coded to plug in after you download them."
$FeatureDownloads | Format-Table -AutoSize

Write-Host ""
Write-Host "Future scaling models"
Write-Host "These are optional model-switching/benchmarking targets, separate from feature dependencies."
$FutureScaling | Format-Table -AutoSize
