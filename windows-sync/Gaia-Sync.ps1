# Gaia Sync - Windows PowerShell 5.1. No additional runtime required.
param([switch]$Automatic,[switch]$Force,[switch]$Verify,[switch]$Install,[switch]$Remove)
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$Cloud='https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/jellyfin-sync'
$Local='http://localhost:8096'
$HomeDir=Join-Path $env:LOCALAPPDATA 'GaiaSync'
$ConfigPath=Join-Path $HomeDir 'credentials.xml'
$TaskName='Gaia Jellyfin Sync'
$script:Phase='Avvio'
function Diagnostic($record) {
 $code='';$http=''
 try {if($record.Exception.Response){$http='; HTTP '+[int]$record.Exception.Response.StatusCode}}catch{}
 try {$detail=$record.ErrorDetails.Message|ConvertFrom-Json;if($detail.diagnostic -match '^[A-Z0-9_]+$'){$code='; codice '+$detail.diagnostic}}catch{}
 return ('Passaggio: '+$script:Phase+$http+$code+'; riga '+$record.InvocationInfo.ScriptLineNumber+'.')
}
function Plain($secure) {
 $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
function Cloud($action,$payload=@{}) {
 $script:Phase='Gaia / '+$action
 $body=@{action=$action;payload=$payload}|ConvertTo-Json -Depth 30 -Compress
 Invoke-RestMethod -Uri $Cloud -Method Post -Headers @{Authorization=('Bearer '+(Plain $script:Credentials.Gaia))} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
}
function Jelly($path) {
 $script:Phase='Jellyfin / lettura catalogo'
 Invoke-RestMethod -Uri ($Local+$path) -Headers @{Authorization=('MediaBrowser Client="Gaia Sync", Device="Windows", DeviceId="gaia-windows-sync", Version="1.0", Token="'+(Plain $script:Credentials.Jellyfin)+'"')} -TimeoutSec 90
}
function Catalog($type='Movie,Series',$parent='') {
 $all=New-Object System.Collections.Generic.List[object]
 $start=0;$expected=$null
 do {
  $path='/Items?Recursive=true&IncludeItemTypes='+$type+'&IsPlaceHolder=false&IsMissing=false&CollapseBoxSetItems=false&EnableUserData=false&EnableTotalRecordCount=true&Fields=Overview,Genres,ProviderIds&SortBy=SortName&SortOrder=Ascending&Limit=200&StartIndex='+$start
  if($parent){$path+='&ParentId='+[uri]::EscapeDataString($parent)}
  $page=Jelly $path
  if($null -eq $page.TotalRecordCount -or $null -eq $page.Items){throw 'Catalogo non valido'}
  if($null -eq $expected){$expected=[int]$page.TotalRecordCount}
  if($expected -ne [int]$page.TotalRecordCount -or $expected -gt 10000){throw 'Catalogo cambiato durante la lettura'}
  $rows=@($page.Items)
  if($rows.Count -eq 0 -and $start -lt $expected){throw 'Lettura incompleta'}
  foreach($x in $rows){$all.Add($x)}
  $start+=$rows.Count
 }while($start -lt $expected)
 if($all.Count -ne $expected){throw 'Lettura incompleta'}
 return $all.ToArray()
}
function ItemId($x){([string]$x.Id).Replace('-','').ToLowerInvariant()}
function SaveResult($text){
 $text|Set-Content (Join-Path $HomeDir 'ultimo-esito.txt') -Encoding UTF8
 if(!$Automatic){Write-Host $text}
}
function RunSync {
 $run=$null
 try {
  $info=Jelly '/System/Info'
  if(!$info.Id){throw 'Identita server mancante'}
  $items=@(Catalog)
  if(!$items.Count){throw 'Catalogo vuoto: nessuna modifica'}
  $ids=@($items|ForEach-Object {ItemId $_}|Sort-Object -Unique)
  if($ids.Count -ne $items.Count){throw 'Duplicati nella lettura'}
  if(!$Automatic){Write-Host ('Trovati '+$items.Count+' film e serie. Raccolgo le copertine...')}
  $collections=@(Catalog 'BoxSet')
  $groups=@{}
  foreach($collection in $collections){
   foreach($member in @(Catalog 'Movie,Series' $collection.Id)){
    $id=ItemId $member
    if(!$groups.ContainsKey($id)){$groups[$id]=New-Object System.Collections.Generic.List[string]}
    $groups[$id].Add([string]$collection.Name)
   }
  }
  $begin=Cloud 'begin' @{server=[string]$info.Id;total=$items.Count};$run=$begin.run
  $cache=@{};$cachePath=Join-Path $HomeDir 'covers.json'
  if(Test-Path $cachePath){try{foreach($c in @(Get-Content $cachePath -Raw|ConvertFrom-Json)){$cache[$c.id]=$c}}catch{}}
  foreach($c in $begin.covers){if($c.url){$cache[$c.id]=$c}}
  $batch=New-Object System.Collections.Generic.List[object]
  foreach($item in $items){
   $id=ItemId $item
   $url=$null;$tag=[string]$item.ImageTags.Primary
   if($tag){
    if($cache.ContainsKey($id) -and $cache[$id].tag -eq $tag -and $cache[$id].url){$url=$cache[$id].url}
    else {
     $script:Phase='Jellyfin / lettura copertina'
     $image=Invoke-WebRequest -UseBasicParsing -Uri ($Local+'/Items/'+$id+'/Images/Primary?MaxWidth=800&Quality=85&Format=Jpg') -Headers @{Authorization=('MediaBrowser Token="'+(Plain $script:Credentials.Jellyfin)+'"')} -TimeoutSec 90
     $bytes=$image.RawContentStream.ToArray()
     if($bytes.Length -gt 1048576){throw 'Copertina troppo grande'}
     $uploaded=Cloud 'cover' @{run=$run;id=$id;bytes=[Convert]::ToBase64String($bytes)};$url=$uploaded.url
     $cache[$id]=@{id=$id;tag=$tag;url=$url}
     ConvertTo-Json -InputObject @($cache.Values) -Depth 5|Set-Content ($cachePath+'.tmp') -Encoding UTF8
     Move-Item ($cachePath+'.tmp') $cachePath -Force
    }
   }
   # Send only catalog metadata. No paths, playback history, users or Jellyfin token.
   $row=@{Id=$id;Name=$item.Name;OriginalTitle=$item.OriginalTitle;Type=$item.Type;
    ProductionYear=$item.ProductionYear;RunTimeTicks=$item.RunTimeTicks;Overview=$item.Overview;
    Genres=@($item.Genres);ProviderIds=@{Tmdb=$item.ProviderIds.Tmdb;Imdb=$item.ProviderIds.Imdb};
    ImageTags=@{Primary=$tag};GaiaCoverUrl=$url;GaiaCollections=@()}
   if($groups.ContainsKey($id)){$row.GaiaCollections=$groups[$id].ToArray()}
   $batch.Add($row)
   if($batch.Count -eq 25){$null=Cloud 'batch' @{run=$run;items=$batch.ToArray()};$batch.Clear();if(!$Automatic){Write-Host 'Un altro gruppo di 25 titoli e stato trasferito.'}}
  }
  if($batch.Count){$null=Cloud 'batch' @{run=$run;items=$batch.ToArray()}}
  # Re-read IDs before commit to detect library changes during a long first upload.
  $check=@(Catalog|ForEach-Object {ItemId $_}|Sort-Object -Unique)
  if($check.Count -ne $ids.Count -or @(Compare-Object $ids $check).Count){throw 'La libreria e cambiata durante il trasferimento'}
  $r=Cloud 'complete' @{run=$run};$run=$null
  SaveResult ('Aggiornamento riuscito: '+(Get-Date -Format 'dd/MM/yyyy HH:mm')+'. Titoli: '+$r.total+'; nuovi: '+$r.added+'; associati: '+$r.linked+'; da verificare: '+$r.review+'; non piu disponibili: '+$r.removed+'.')
 }catch {
  $failure=$_;$diagnostic=Diagnostic $failure
  if($run){try{$null=Cloud 'fail' @{run=$run}}catch{}}
  SaveResult ('Aggiornamento non riuscito. Il catalogo precedente e conservato. '+$diagnostic+' Comunica questo messaggio, senza inviare chiavi.')
  $script:Phase=($diagnostic -replace ';.*$','')
  throw
 }
}
try {
 New-Item -ItemType Directory -Path $HomeDir -Force|Out-Null
 if($Remove){Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue;Write-Host 'Aggiornamenti automatici disattivati.';exit 0}
 if(!(Test-Path $ConfigPath)){
  if($Automatic){exit 1}
  Write-Host 'Configurazione Gaia. La chiave resta cifrata per questo utente Windows.'
  $j=Read-Host 'Incolla la chiave API Jellyfin (non viene mostrata) e premi Invio' -AsSecureString
  if($j.Length -lt 10){throw 'Chiave vuota'}
  $pairPath=Join-Path $PSScriptRoot 'collegamento-gaia.txt'
  if(!(Test-Path $pairPath)){throw 'Manca il file di collegamento Gaia nel pacchetto'}
  $g=(Get-Content $pairPath -Raw).Trim()|ConvertTo-SecureString -AsPlainText -Force
  [pscustomobject]@{Jellyfin=$j;Gaia=$g}|Export-Clixml -Path $ConfigPath
 }
 $script:Credentials=Import-Clixml $ConfigPath
 # A manual launch also updates the installed copy, keeping existing credentials.
 $installed=Join-Path $HomeDir 'Gaia-Sync.ps1'
 $source=Join-Path $PSScriptRoot 'Gaia-Sync.ps1'
 if(!$Automatic -and (Test-Path $installed) -and $installed -ne $source){Copy-Item $source $installed -Force}
 if($Install){
  Copy-Item (Join-Path $PSScriptRoot 'Gaia-Sync.ps1') (Join-Path $HomeDir 'Gaia-Sync.ps1') -Force
  $a=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $HomeDir 'Gaia-Sync.ps1')+'" -Automatic')
  $triggers=@((New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)))
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
  $user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $a -Trigger $triggers -Settings $settings -Principal $principal -Force|Out-Null
  Write-Host 'Automatico attivo: una sincronizzazione ogni 7 giorni; richieste manuali controllate ogni 15 minuti quando questo utente e collegato.'
  exit 0
 }
 if(!$Automatic -and !$Force -and !$Verify){
  Write-Host '1 - Verifica collegamento';Write-Host '2 - Aggiorna adesso';Write-Host '3 - Mostra ultimo esito'
  $choice=Read-Host 'Scegli 1, 2 o 3'
  if($choice -eq '1'){$Verify=$true}elseif($choice -eq '2'){$Force=$true}elseif($choice -eq '3'){Get-Content (Join-Path $HomeDir 'ultimo-esito.txt') -ErrorAction SilentlyContinue;exit 0}else{exit 0}
 }
 $mutex=New-Object Threading.Mutex($false,'Local\GaiaJellyfinSync')
 $locked=$mutex.WaitOne(0)
 if(!$locked){if(!$Automatic){Write-Host 'Un aggiornamento e gia in corso.'};exit 0}
 try {
  if($Verify){$info=Jelly '/System/Info';$null=Cloud 'verify';$rows=@(Catalog);Write-Host ('Collegamento riuscito. Jellyfin '+$info.Version+'; '+$rows.Count+' film e serie. Nessuna modifica al catalogo Gaia.');exit 0}
  if($Automatic){$poll=Cloud 'poll';if(!$poll.due){exit 0}}
  RunSync
 }finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
}catch {
 if(!$Automatic){Write-Host ('Operazione non riuscita. '+(Diagnostic $_)+' Se la configurazione aveva gia funzionato, non occorre reinserire la chiave.') -ForegroundColor Red}
 exit 1
}
