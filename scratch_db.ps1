Add-Type -AssemblyName System.Data
$connStr = "Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT * FROM T_PER2_IPO_Tube1 WHERE job = 'S40G600017'"
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $table = New-Object System.Data.DataTable
    $adapter.Fill($table) | Out-Null
    Write-Host "--- TUBE 1 ---"
    $table | Format-Table -AutoSize | Out-String | Write-Host

    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT * FROM T_PER2_IPO_Tube2 WHERE job = 'S40G600017'"
    $adapter2 = New-Object System.Data.SqlClient.SqlDataAdapter($cmd2)
    $table2 = New-Object System.Data.DataTable
    $adapter2.Fill($table2) | Out-Null
    Write-Host "--- TUBE 2 ---"
    $table2 | Format-Table -AutoSize | Out-String | Write-Host
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
