# Opens a support report in Outlook (zip attached) or falls back to mailto:.
# Called from the WallBoard server — SUPPORT_EMAIL stays server-side only.
param(
    [Parameter(Mandatory)][string]$ZipPath,
    [Parameter(Mandatory)][string]$To,
    [Parameter(Mandatory)][string]$Subject,
    [Parameter(Mandatory)][string]$BodyPath,
    [ValidateSet('outlook', 'mailto')][string]$Mode = 'outlook'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ZipPath)) {
    Write-Error "Support zip not found: $ZipPath"
    exit 2
}
if (-not (Test-Path -LiteralPath $BodyPath)) {
    Write-Error "Body file not found: $BodyPath"
    exit 2
}

$Body = Get-Content -LiteralPath $BodyPath -Raw -Encoding UTF8

if ($Mode -eq 'mailto') {
    $encodedSubject = [uri]::EscapeDataString($Subject)
    $encodedBody = [uri]::EscapeDataString($Body)
    $mailto = "mailto:$To?subject=$encodedSubject&body=$encodedBody"
    Start-Process $mailto
    exit 0
}

# Classic Outlook COM — attachment included; user reviews and clicks Send.
try {
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mail = $outlook.CreateItem(0)
    $mail.To = $To
    $mail.Subject = $Subject
    $mail.Body = $Body
    [void]$mail.Attachments.Add($ZipPath)
    $mail.Display()
    exit 0
} catch {
    exit 1
}
