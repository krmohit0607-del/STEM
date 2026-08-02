param([string]$path)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[System.IO.Compression.ZipFile]::OpenRead($path)
function ReadEntry($name){ $e=$zip.GetEntry($name); $sr=New-Object System.IO.StreamReader($e.Open()); $t=$sr.ReadToEnd(); $sr.Close(); return $t }
$ss=[xml](ReadEntry 'xl/sharedStrings.xml')
$strings=@()
foreach($si in $ss.sst.si){
  if($si.t){ if($si.t.'#text'){ $strings+=$si.t.'#text' } else { $strings+=[string]$si.t } }
  elseif($si.r){ $txt=''; foreach($r in $si.r){ if($r.t.'#text'){$txt+=$r.t.'#text'}else{$txt+=[string]$r.t} }; $strings+=$txt }
  else { $strings+='' }
}
$sheet=[xml](ReadEntry 'xl/worksheets/sheet1.xml')
function ColNum($ref){ $c=($ref -replace '[0-9]',''); $n=0; foreach($ch in $c.ToCharArray()){ $n=$n*26+([int][char]$ch-64) }; return $n }
$out=New-Object System.Collections.Generic.List[string]
foreach($row in $sheet.worksheet.sheetData.row){
  $cells=@{}; $maxc=0
  foreach($c in $row.c){
    $col=ColNum $c.r; if($col -gt $maxc){$maxc=$col}
    $v=$c.v
    if($c.t -eq 's' -and $v -ne $null){ $val=$strings[[int]$v] } else { $val=$v }
    $cells[$col]=$val
  }
  if($maxc -eq 0){ continue }
  $line=@(); for($i=1;$i -le $maxc;$i++){ $line += ([string]$cells[$i]) }
  $joined=($line -join ' | ')
  if($joined.Trim(' |') -ne ''){ $out.Add('R'+$row.r+': '+$joined) }
}
$zip.Dispose()
$out -join "`n" | Out-File -FilePath "$PSScriptRoot\xlsxdump.txt" -Encoding utf8
Write-Output "WROTE $($out.Count) rows"
