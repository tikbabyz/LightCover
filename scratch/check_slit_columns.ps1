Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT TOP 5 id, job, part_no, material_no, std_thick, std_width, std_length, product_date, lot_number FROM T_PER2_Slit_Head ORDER BY id DESC"
    $ad = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    $ad.Fill($dt) | Out-Null
    Write-Host "=== T_PER2_Slit_Head ==="
    $dt | Format-Table -AutoSize | Out-String | Write-Host

    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT TOP 10 id, job, actualfoam_width, emboss_lot, firstshot_width, roll_used, producted_qty, yield FROM T_PER2_Slit_Detail ORDER BY id DESC"
    $ad2 = New-Object System.Data.SqlClient.SqlDataAdapter($cmd2)
    $dt2 = New-Object System.Data.DataTable
    $ad2.Fill($dt2) | Out-Null
    Write-Host "=== T_PER2_Slit_Detail ==="
    $dt2 | Format-Table -AutoSize | Out-String | Write-Host
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
