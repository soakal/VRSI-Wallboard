# Opens a support report in Outlook (zip attached) or falls back to mailto:.
# Called from the WallBoard server — SUPPORT_EMAIL stays server-side only.
#
# Single invocation handles both attempts so the server never has to spawn twice
# (a second UI-touching launch can corrupt a compose window the first attempt
# already put on screen — seen live on a kiosk: decoded subject/body dumped into
# the To field of a "New mail" window).
#
# Contract with the server (supportService.ts):
#   exit 0 + "outlook" on stdout  → classic Outlook compose shown, zip attached
#   exit 0 + "mailto"  on stdout  → default mail app launched (recipient only)
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

# --- Attempt 1: classic Outlook COM — attachment included; user reviews and clicks Send.
# $displayAttempted guards the fallback: once Display() has been called, a compose
# window may already be on screen, and launching mailto on top of it risks
# corrupting the visible message. Fail closed instead — the server then tells
# the user to attach the Desktop zip manually.
$displayAttempted = $false
try {
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mail = $outlook.CreateItem(0)
    $mail.To = $To
    $mail.Subject = $Subject
    $mail.Body = $Body
    [void]$mail.Attachments.Add($ZipPath)
    $displayAttempted = $true
    $mail.Display()
    Write-Output 'outlook'
    exit 0
} catch {
    [Console]::Error.WriteLine("Outlook COM compose failed: $($_.Exception.Message)")
    if ($displayAttempted) {
        # Display() itself failed — a window may still have appeared. Never
        # launch mailto on top of it.
        exit 1
    }
}

# --- Attempt 2: bare mailto (recipient only). ?subject=&body= parameters are
# deliberately omitted: the "new Outlook" (olk.exe) mailto handler was observed
# live decoding a well-formed query string into the To field (Subject empty,
# recipient replaced by "=<subject>&body=<body>"), producing an unsendable
# message. Everything the recipient needs is already inside the zip
# (message.txt), which the user attaches by hand on this path anyway.
try {
    Start-Process "mailto:$To"
    Write-Output 'mailto'
    exit 0
} catch {
    [Console]::Error.WriteLine("mailto launch failed: $($_.Exception.Message)")
    exit 1
}
