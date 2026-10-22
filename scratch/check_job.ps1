Add-Type -AssemblyName System.Data
$connStr = "Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
try {
    $conn.Open()
    $tables = @('T_PER2_IPO_Head', 'T_PER2_IPO_Detail', 'T_PER2_IPO_Temperature', 'T_PER2_IPO_Defect', 'T_PER2_IPO_Tube1', 'T_PER2_IPO_Tube2')
    foreach ($tbl in $tables) {
        Write-Host "=== $tbl ==="
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT * FROM $tbl WHERE job = 'S40G500008'"
        $ad = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        $dt = New-Object System.Data.DataTable
        $ad.Fill($dt) | Out-Null
        $dt | Format-Table -AutoSize | Out-String | Write-Host
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
