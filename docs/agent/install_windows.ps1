<#
.SYNOPSIS
    在 Windows 客户机上一键部署 CAPE Guest Agent。

.DESCRIPTION
    需要管理员权限。脚本会：
      1. 校验当前 Python 是否为 32 位（agent 强制要求）；
      2. 拷贝 agent.py 到指定目录并改名为 agent.pyw；
      3. 注册一个 Logon trigger + Highest privileges 的 Task Scheduler 任务；
      4. 启动一次 task；
      5. 探活 http://127.0.0.1:8000/。

.PARAMETER AgentSrc
    本地 agent.py 路径，可以是 UNC 共享、本地文件、或先用 Invoke-WebRequest
    下下来的临时路径。必填。

.PARAMETER InstallDir
    Agent 安装目录。默认 C:\Tools。

.PARAMETER TaskName
    Task Scheduler 任务名。务必避开 cape/cuckoo/agent/sandbox 等关键字以减
    少反沙箱命中。默认 "pizza"。

.PARAMETER PythonExe
    Pythonw 可执行文件路径。默认会自动在 PATH 里找 pyw.exe / pythonw.exe。

.EXAMPLE
    PowerShell.exe -ExecutionPolicy Bypass -File install_windows.ps1 `
        -AgentSrc "\\HOST\share\agent.py"

.EXAMPLE
    PowerShell.exe -ExecutionPolicy Bypass -File install_windows.ps1 `
        -AgentSrc "C:\Users\dev\Downloads\agent.py" `
        -InstallDir "C:\Tools" `
        -TaskName "pizza"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $AgentSrc,

    [string] $InstallDir = "C:\Tools",

    [string] $TaskName = "pizza",

    [string] $PythonExe = ""
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "请以管理员身份运行 PowerShell 后再执行本脚本。"
    }
}

function Resolve-PythonW {
    param([string] $UserSpecified)

    if ($UserSpecified) {
        if (-not (Test-Path $UserSpecified)) {
            throw "指定的 PythonExe 不存在: $UserSpecified"
        }
        return $UserSpecified
    }

    foreach ($candidate in @("pyw.exe", "pythonw.exe")) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw "找不到 pyw.exe / pythonw.exe，请先安装 32 位 Python 3 并将其加入 PATH（或显式指定 -PythonExe）。"
}

function Assert-Python32Bit {
    param([string] $PyExe)

    # pyw.exe 是窗口模式，不能直接拿 stdout。改用同名的 python.exe 检测。
    $pyConsole = $PyExe -replace "pythonw\.exe$", "python.exe" `
                       -replace "pyw\.exe$", "py.exe"
    if (-not (Test-Path $pyConsole)) {
        Write-Warning "找不到对应的控制台版 Python（$pyConsole），跳过架构检测。"
        return
    }
    $maxsize = & $pyConsole -c "import sys; print(sys.maxsize)"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Python 检测命令失败，跳过架构检测。"
        return
    }
    if ([int64]$maxsize -gt 2147483647) {
        throw "检测到 64 位 Python（sys.maxsize=$maxsize）。CAPE agent 必须用 32 位 Python，请重装。"
    }
    Write-Host "[ok] Python 是 32 位（sys.maxsize=$maxsize）" -ForegroundColor Green
}

function Copy-AgentFile {
    param(
        [string] $Source,
        [string] $Dir
    )
    if (-not (Test-Path $Source)) {
        throw "找不到 agent 源文件: $Source"
    }
    if (-not (Test-Path $Dir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    }
    $dest = Join-Path $Dir "agent.pyw"
    Copy-Item -Path $Source -Destination $dest -Force
    Write-Host "[ok] 已拷贝到 $dest" -ForegroundColor Green
    return $dest
}

function Register-AgentTask {
    param(
        [string] $TaskName,
        [string] $PyExe,
        [string] $AgentPath
    )

    # 如已存在同名 task，先删
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "[..] 同名 task 已存在，先删除" -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $action  = New-ScheduledTaskAction -Execute $PyExe -Argument $AgentPath
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $princ   = New-ScheduledTaskPrincipal -UserId "$env:UserName" -RunLevel Highest
    $task    = New-ScheduledTask -Action $action -Trigger $trigger -Principal $princ
    Register-ScheduledTask -TaskName $TaskName -InputObject $task | Out-Null
    Write-Host "[ok] 已注册 Task Scheduler 任务 '$TaskName'（最高权限 + 登录触发）" -ForegroundColor Green
}

function Start-AgentTask {
    param([string] $TaskName)
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "[ok] 已启动 task" -ForegroundColor Green
    Start-Sleep -Seconds 3
}

function Test-AgentAlive {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                Write-Host "[ok] agent 存活：$($resp.Content)" -ForegroundColor Green
                return
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "10 秒内 agent 仍未响应 http://127.0.0.1:8000/。检查 Task Scheduler 历史 / Python 路径 / 防火墙。"
}

# -- 主流程 ----------------------------------------------------------------

Assert-Admin
$resolvedPy = Resolve-PythonW -UserSpecified $PythonExe
Write-Host "[..] Python (windowless): $resolvedPy"
Assert-Python32Bit -PyExe $resolvedPy

$agentPath = Copy-AgentFile -Source $AgentSrc -Dir $InstallDir
Register-AgentTask -TaskName $TaskName -PyExe $resolvedPy -AgentPath $agentPath
Start-AgentTask    -TaskName $TaskName
Test-AgentAlive

Write-Host ""
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host "  1. 关闭 Windows Defender 实时扫描和 Windows Update（建议跑 installer\\win10_disabler.ps1）"
Write-Host "  2. 在 host 上 curl http://<VM_IP>:8000/ 验证 host↔guest 通路"
Write-Host "  3. 关机前确保 agent 仍在跑，然后拍快照"
Write-Host "  4. 把 snapshot 名写到 host 的 conf/<machinery>.conf"
