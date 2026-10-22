Add-Type -AssemblyName 'System.Data'
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT * FROM T_PER2_IPO_Head WHERE job = 'S40C400049'"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        Write-Output ($reader.GetName($i) + ': ' + $reader.GetValue($i))
    }
}
$reader.Close()

$cmd2 = $conn.CreateCommand()
$cmd2.CommandText = "SELECT * FROM T_PER2_IPO_Detail WHERE job = 'S40C400049'"
$reader2 = $cmd2.ExecuteReader()
Write-Output "--- DETAILS ---"
while ($reader2.Read()) {
    Write-Output ("run_no=" + $reader2["run_no"] + ", lot=" + $reader2["lot_emboss"] + ", meters=" + $reader2["total_meters"])
}
$reader2.Close()

$cmd3 = $conn.CreateCommand()
$cmd3.CommandText = "SELECT * FROM T_PER2_IPO_Tube2 WHERE job = 'S40C400049'"
$reader3 = $cmd3.ExecuteReader()
Write-Output "--- TUBE2 ---"
while ($reader3.Read()) {
    Write-Output ("detail_run_no=" + $reader3["detail_run_no"] + ", id1=" + $reader3["inside_dia_1"])
}
$reader3.Close()
$conn.Close()
