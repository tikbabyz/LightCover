Add-Type -AssemblyName 'System.Data'
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.9;Database=Live_App;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
SELECT TOP 5 j.job, j.suffix, j.item, j.description, j.stat,
       (SELECT TOP 1 jm.item FROM jobmatl_mst jm WHERE jm.job = j.job AND jm.suffix = j.suffix AND (jm.item LIKE 'P%' OR jm.item LIKE 'T%')) as matl,
       im.Uf_Thick, im.Uf_Wide, im.Uf_Long, im.description as item_desc
FROM job_mst j
LEFT JOIN item_mst im ON j.item = im.item
WHERE j.job IN (SELECT DISTINCT job FROM jobmatl_mst WHERE item = 'P113814011')
ORDER BY j.job_date DESC
"@
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Output ("job=" + $r["job"] + ", item=" + $r["item"] + ", matl=" + $r["matl"] + ", thick=" + $r["Uf_Thick"] + ", wide=" + $r["Uf_Wide"] + ", long=" + $r["Uf_Long"] + ", item_desc=" + $r["item_desc"])
}
$r.Close()
$conn.Close()
