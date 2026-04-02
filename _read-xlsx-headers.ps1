Add-Type -AssemblyName System.IO.Compression.FileSystem
$path = 'C:\Users\08032645\Documents\sisexefin\empenhos-import.xlsx'
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
function Get-ZipEntryText {
    param([string]$name)
    $e = $zip.GetEntry($name)
    if (-not $e) { return $null }
    $sr = New-Object System.IO.StreamReader($e.Open())
    try { return $sr.ReadToEnd() } finally { $sr.Close() }
}
[xml]$ssXml = Get-ZipEntryText 'xl/sharedStrings.xml'
$strings = New-Object System.Collections.Generic.List[string]
foreach ($si in $ssXml.sst.si) {
    if ($si.t) {
        $strings.Add([string]$si.t.'#text')
    } elseif ($si.r) {
        $parts = @($si.r) | ForEach-Object {
            if ($_.t -and $_.t.'#text') { [string]$_.t.'#text' } else { '' }
        }
        $strings.Add(($parts -join ''))
    } else {
        $strings.Add('')
    }
}
[xml]$shXml = Get-ZipEntryText 'xl/worksheets/sheet1.xml'
$rows = @{}
foreach ($rowEl in $shXml.worksheet.sheetData.row) {
    foreach ($c in $rowEl.c) {
        $ref = [string]$c.r
        if (-not $ref) { continue }
        $rowNum = [int]($ref -replace '[^\d]','')
        $col = ($ref -replace '\d','')
        $v = $c.v
        if ($null -eq $v) { continue }
        $val = [string]$v
        if ($c.t -eq 's' -and $val -match '^\d+$') {
            $idx = [int]$val
            if ($idx -ge 0 -and $idx -lt $strings.Count) { $val = $strings[$idx] }
        }
        if (-not $rows.ContainsKey($rowNum)) { $rows[$rowNum] = @{} }
        $rows[$rowNum][$col] = $val
    }
}
$zip.Dispose()

function ColOrder($col) {
    $n = 0
    foreach ($ch in $col.ToCharArray()) { $n = $n * 26 + ([int][char]$ch - 64) }
    return $n
}
1..5 | ForEach-Object {
    $r = $_
    if (-not $rows.ContainsKey($r)) { return }
    $ordered = $rows[$r].GetEnumerator() | Sort-Object { ColOrder($_.Key) }
    $vals = $ordered | ForEach-Object { $_.Value }
    Write-Output "Row $r : $($vals -join ' ||| ')"
}
