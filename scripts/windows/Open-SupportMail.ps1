# Opens a support report in Outlook (zip attached) or falls back to mailto:.
# Called from the WallBoard server — SUPPORT_EMAIL stays server-side only.
#
# Single invocation handles both attempts so the server never has to spawn twice
# (a second UI-touching launch can corrupt a compose window the first attempt
# already put on screen — seen live on a kiosk: decoded subject/body dumped into
# the To field of a "New mail" window).
#
# The Outlook COM attempt runs inside a watchdogged runspace with its OWN
# 10-second timeout. On new-Outlook-only machines, New-Object -ComObject
# Outlook.Application does not fail fast — it HANGS (seen live: the server's
# outer 30s spawnSync timeout killed this whole process, so the mailto fallback
# below never ran and nothing opened at all). The inner timeout abandons a hung
# COM attempt quickly so the fallback still runs in this same process, well
# inside the server's outer budget.
#
# Contract with the server (supportService.ts):
#   exit 0 + "outlook" on stdout  → classic Outlook compose shown, zip attached
#   exit 0 + "mailto"  on stdout  → default mail app launched (To + Subject; no Body)
#   exit non-zero                 → nothing usable opened; reason on stderr
#
# Subject and Body both arrive via temp files (never as raw argv) so no value
# ever rides through powershell.exe's legacy command-line tokenizer.
param(
    [Parameter(Mandatory)][string]$ZipPath,
    [Parameter(Mandatory)][string]$To,
    [Parameter(Mandatory)][string]$SubjectPath,
    [Parameter(Mandatory)][string]$BodyPath
)

$ErrorActionPreference = 'Stop'

# Must stay well under supportService.ts SUPPORT_SPAWN_TIMEOUT_MS (30s):
# worst case here is ~10s COM + a couple of seconds for Start-Process mailto,
# leaving ample headroom for powershell.exe startup on a slow kiosk.
$ComTimeoutSeconds = 10

if (-not (Test-Path -LiteralPath $ZipPath)) {
    [Console]::Error.WriteLine("Support zip not found: $ZipPath")
    exit 2
}
if (-not (Test-Path -LiteralPath $SubjectPath)) {
    [Console]::Error.WriteLine("Subject file not found: $SubjectPath")
    exit 2
}
if (-not (Test-Path -LiteralPath $BodyPath)) {
    [Console]::Error.WriteLine("Body file not found: $BodyPath")
    exit 2
}

$Subject = (Get-Content -LiteralPath $SubjectPath -Raw -Encoding UTF8).Trim()
$Body = Get-Content -LiteralPath $BodyPath -Raw -Encoding UTF8

# Hard process exit. PowerShell's plain `exit` waits for all foreground
# threads — and an abandoned runspace pipeline thread hung inside a native
# COM call is a FOREGROUND thread (verified on this machine: the process
# lingered for minutes after `exit`). That lingering process would make the
# server's spawnSync report ETIMEDOUT even though a mail window DID open.
# [Environment]::Exit terminates the process regardless of hung threads.
# Flush stdout/stderr first so the method line ("outlook"/"mailto") and any
# error text reach the server before the process dies.
function Exit-Hard([int]$Code) {
    try { [Console]::Out.Flush() } catch {}
    try { [Console]::Error.Flush() } catch {}
    [Environment]::Exit($Code)
}

# --- Attempt 1: classic Outlook COM — attachment included; user reviews and clicks Send.
#
# Runs in a separate in-process runspace (NOT Start-Job: a job is a second
# powershell.exe whose multi-second startup would eat the inner timeout budget,
# and its streamed output is the only way to learn how far it got before a
# kill). The runspace shares a synchronized hashtable with this thread, so
# DisplayAttempted is readable in real time even when the COM call is hung.
#
# DisplayAttempted guards the fallback: once Display() has been called, a
# compose window may already be on screen, and launching mailto on top of it
# risks corrupting the visible message. Fail closed instead — the server then
# tells the user to attach the Desktop zip manually.
$state = [hashtable]::Synchronized(@{
    DisplayAttempted = $false
    Succeeded        = $false
    ErrorMessage     = $null
})

$comAttempt = {
    param($State, $ZipPath, $To, $Subject, $Body)
    try {
        $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
        $mail = $outlook.CreateItem(0)
        $mail.To = $To
        $mail.Subject = $Subject
        $mail.Body = $Body
        [void]$mail.Attachments.Add($ZipPath)
        $State.DisplayAttempted = $true
        $mail.Display()
        $State.Succeeded = $true
    } catch {
        $State.ErrorMessage = $_.Exception.Message
    }
}

$runspace = [runspacefactory]::CreateRunspace()
$runspace.ApartmentState = 'STA'      # Office COM automation expects STA
$runspace.ThreadOptions = 'UseNewThread'
$runspace.Open()
$psWorker = [powershell]::Create()
$psWorker.Runspace = $runspace
[void]$psWorker.AddScript($comAttempt.ToString())
[void]$psWorker.AddArgument($state)
[void]$psWorker.AddArgument($ZipPath)
[void]$psWorker.AddArgument($To)
[void]$psWorker.AddArgument($Subject)
[void]$psWorker.AddArgument($Body)
$asyncResult = $psWorker.BeginInvoke()
$finished = $asyncResult.AsyncWaitHandle.WaitOne($ComTimeoutSeconds * 1000)

if ($finished) {
    try { [void]$psWorker.EndInvoke($asyncResult) } catch {
        if (-not $state.ErrorMessage) { $state.ErrorMessage = $_.Exception.Message }
    }
    $psWorker.Dispose()
    $runspace.Dispose()
    if ($state.Succeeded) {
        Write-Output 'outlook'
        Exit-Hard 0
    }
    $reason = if ($state.ErrorMessage) { $state.ErrorMessage } else { 'unknown error' }
    [Console]::Error.WriteLine("Outlook COM compose failed: $reason")
    if ($state.DisplayAttempted) {
        # Display() itself failed — a window may still have appeared. Never
        # launch mailto on top of it.
        Exit-Hard 1
    }
    # COM failed before Display() — fall through to mailto below.
} else {
    # COM attempt is HUNG (typical on new-Outlook-only machines where classic
    # COM activation blocks instead of failing). Deliberately abandon it:
    # do NOT call Stop()/Dispose() here — both can block indefinitely waiting
    # on a pipeline thread stuck inside a native COM call. The orphaned thread
    # is killed by Exit-Hard moments from now, after the mailto attempt (it is
    # a foreground thread, so a plain `exit` would never return control to the
    # server — see Exit-Hard above).
    #
    # No Stop-Process on OUTLOOK.EXE either: we cannot tell a half-initialized
    # automation-spawned instance from one the user opened with real unsaved
    # drafts, and COM's server lifetime handling reaps an abandoned activation
    # once this client process exits. Killing the user's Outlook would be worse
    # than any leak.
    [Console]::Error.WriteLine(
        "Outlook COM compose timed out after ${ComTimeoutSeconds}s (hung COM activation; likely a new-Outlook-only machine)")
    if ($state.DisplayAttempted) {
        # Hung at Display() itself — a window may be (partially) up. Fail
        # closed rather than stack mailto on top of it.
        Exit-Hard 1
    }
    # Hung before Display() — safe to fall through to mailto below.
}

# --- Attempt 2: mailto with subject only. ?body= is deliberately omitted:
# the "new Outlook" (olk.exe) mailto handler was observed live decoding a
# well-formed subject+body query string into the To field (Subject empty,
# recipient replaced by "=<subject>&body=<body>"), producing an unsendable
# message. A subject-only query string was verified live on the same machine
# to populate cleanly with no garbling (To and Subject both correct) — body
# stays untested and out, but it's fully preserved in the zip's message.txt,
# which the user attaches by hand on this path anyway.
try {
    $encodedSubject = [uri]::EscapeDataString($Subject)
    Start-Process "mailto:${To}?subject=$encodedSubject"
    Write-Output 'mailto'
    Exit-Hard 0
} catch {
    [Console]::Error.WriteLine("mailto launch failed: $($_.Exception.Message)")
    Exit-Hard 1
}
