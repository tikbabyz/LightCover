Add-Type -AssemblyName System.Data
$connStr = "Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT TOP 3 * FROM T_PER2_IPO_Defect ORDER BY id DESC"
    $r = $cmd.ExecuteReader()
    $dt = New-Object System.Data.DataTable
    $dt.Load($r)
    $dt | Format-Table -AutoSize
    $r.Close()

    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT TOP 3 id, job, run_no, total_meters, downtime_note FROM T_PER2_IPO_Detail ORDER BY id DESC"
    $r2 = $cmd2.ExecuteReader()
    $dt2 = New-Object System.Data.DataTable
    $dt2.Load($r2)
    $dt2 | Format-Table -AutoSize
    $r2.Close()
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
