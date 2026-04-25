$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $ProjectDir "INICIAR_GERADOR_POP_FM_SILENCIOSO.vbs"
$Icon = Join-Path $ProjectDir "assets\gerador-pop-fm.ico"

if (-not (Test-Path $Launcher)) {
  throw "Launcher silencioso nao encontrado: $Launcher"
}
if (-not (Test-Path $Icon)) {
  throw "Icone nao encontrado: $Icon"
}

$Shell = New-Object -ComObject WScript.Shell

function New-AppShortcut($ShortcutPath) {
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $Shortcut.Arguments = """" + $Launcher + """"
  $Shortcut.WorkingDirectory = $ProjectDir
  $Shortcut.WindowStyle = 7
  $Shortcut.Description = "Gerador POP FM"
  $Shortcut.IconLocation = $Icon
  $Shortcut.Save()
}

$Desktop = [Environment]::GetFolderPath("Desktop")
New-AppShortcut (Join-Path $Desktop "Gerador POP FM.lnk")

$Programs = [Environment]::GetFolderPath("Programs")
$StartMenuDir = Join-Path $Programs "Gerador POP FM"
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
New-AppShortcut (Join-Path $StartMenuDir "Gerador POP FM.lnk")

Write-Host "Atalhos criados na Area de Trabalho e no Menu Iniciar."
