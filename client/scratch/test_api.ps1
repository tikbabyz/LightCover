$res = Invoke-RestMethod -Uri 'http://localhost:7017/api/slit/bom/5600300950' -Method Get
$res | ConvertTo-Json -Depth 5
