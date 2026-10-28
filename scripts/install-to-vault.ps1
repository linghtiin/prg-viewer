#Requires -Version 5.1
<#
.SYNOPSIS
  将构建好的 Project Graph Viewer 安装到指定的 Obsidian 库。

.DESCRIPTION
  校验目标确实是 Obsidian 库（存在 .obsidian 目录），再复制 main.js、manifest.json、styles.css
  到 <vault>/.obsidian/plugins/prg-viewer/。不会修改库中的笔记或 .prg 文件。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install-to-vault.ps1 -Vault "C:\Users\me\Documents\Mind Vault"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install-to-vault.ps1 -Vault "D:\Vault" -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string]$Vault,

  [string]$PluginFolder = "prg-viewer"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Vault -PathType Container)) {
  throw "库目录不存在：$Vault"
}

$vaultPath = (Resolve-Path -LiteralPath $Vault).Path
$obsidianDir = Join-Path $vaultPath ".obsidian"
if (-not (Test-Path -LiteralPath $obsidianDir -PathType Container)) {
  throw "目标不是 Obsidian 库（缺少 .obsidian 目录）：$vaultPath"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$artifacts = @("main.js", "manifest.json", "styles.css")
foreach ($file in $artifacts) {
  $source = Join-Path $repoRoot $file
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "缺少构建产物 $file，请先在仓库根目录运行 pnpm build"
  }
}

$targetDir = Join-Path (Join-Path $obsidianDir "plugins") $PluginFolder
Write-Verbose "安装目标：$targetDir"

if ($PSCmdlet.ShouldProcess($targetDir, "复制插件文件")) {
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  foreach ($file in $artifacts) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $targetDir $file) -Force
    Write-Host "已复制 $file"
  }
  Write-Host ""
  Write-Host "安装完成：$targetDir"
  Write-Host "请在 Obsidian 中打开 设置 → 第三方插件，启用 Project Graph Viewer。"
  Write-Host "如果插件已在运行，请先禁用再启用，或重新加载 Obsidian。"
}
