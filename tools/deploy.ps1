<#
.SYNOPSIS
一键推送：提交本地改动 -> 推送到 GitHub -> 同步主站到 Cloudflare R2

.DESCRIPTION
依次执行：
  1. git add -A + commit（未提供说明时自动生成时间戳）
  2. git pull --rebase origin main（合并协作者改动）
  3. git push origin main
  4. 用 tools/sync_r2.py 把网页 / 素材 / 数据同步到 R2（主站）

.PARAMETER Message
本次提交说明（可选）。

.PARAMETER SkipGit
只同步 R2，不提交 / 推送 GitHub。

.PARAMETER SkipR2
只提交 / 推送 GitHub，不同步 R2。

.PARAMETER IncludePromo
同时把 promo-standalone/ 演示站也上传到 R2。

.PARAMETER Verify
完成后请求一次主站首页，确认 200。

.EXAMPLE
.\tools\deploy.ps1 "trial 标注更新"
.EXAMPLE
.\deploy.bat "trial 标注更新"
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Message = "",
    [switch]$SkipGit,
    [switch]$SkipR2,
    [switch]$IncludePromo,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"

$Tools = $PSScriptRoot
$Repo = Split-Path -Parent $Tools
Set-Location $Repo

# R2 凭证存放在仓库外的 .r2tool 目录，不会随 GitHub 公开
$CredFile = Join-Path (Split-Path -Parent $Repo) ".r2tool\r2-credentials.ps1"
if (Test-Path $CredFile) {
    . $CredFile
}
foreach ($v in "R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET") {
    if (-not (Get-Item "Env:$v" -ErrorAction SilentlyContinue)) {
        throw "缺少 R2 凭证 $v（请检查 .r2tool\r2-credentials.ps1）"
    }
}

$Py = "E:\python\3.11.9\python.exe"
if (-not (Test-Path $Py)) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "找不到 Python，请检查 E:\python\3.11.9\python.exe"
    }
    $Py = $cmd.Source
}

if (-not $SkipGit) {
    Write-Host ""
    Write-Host "== 1/3 提交本地改动 ==" -ForegroundColor Cyan
    git add -A
    if ($LASTEXITCODE -ne 0) {
        throw "git add 失败"
    }
    $changes = git status --porcelain
    if ($changes) {
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $Message = "auto-deploy $(Get-Date -Format 'yyyy-MM-dd HHmm')"
        }
        git commit -m $Message
        if ($LASTEXITCODE -ne 0) {
            throw "git commit 失败"
        }

        Write-Host ""
        Write-Host "== 2/3 拉取合并远程改动 ==" -ForegroundColor Cyan
        git pull --rebase origin main
        if ($LASTEXITCODE -ne 0) {
            throw "git pull 失败（可能有冲突，需要手动处理）"
        }

        Write-Host ""
        Write-Host "== 推送到 GitHub ==" -ForegroundColor Cyan
        git push origin main
        if ($LASTEXITCODE -ne 0) {
            throw "git push 失败"
        }
    }
    else {
        Write-Host "没有需要提交的改动，跳过 GitHub 步骤。" -ForegroundColor Yellow
    }
}

if (-not $SkipR2) {
    Write-Host ""
    Write-Host "== 3/3 同步主站到 Cloudflare R2 ==" -ForegroundColor Cyan
    $syncArgs = @()
    if ($IncludePromo) {
        $syncArgs += "--include-promo"
    }
    & $Py (Join-Path $Tools "sync_r2.py") @syncArgs
    if ($LASTEXITCODE -ne 0) {
        throw "R2 同步失败"
    }
}

if ($Verify) {
    Write-Host ""
    Write-Host "== 检查主站 ==" -ForegroundColor Cyan
    try {
        $r = Invoke-WebRequest -Uri "https://manosaba-library.com/" -UseBasicParsing -TimeoutSec 30
        Write-Host ("主站状态: {0}" -f $r.StatusCode) -ForegroundColor Green
    }
    catch {
        Write-Warning "主站检查失败: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "完成！" -ForegroundColor Green
