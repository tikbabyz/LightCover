Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT TOP 5 * FROM T_PER2_Slit_Head ORDER BY id DESC"
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Host "ID=$($r['id']) | Job=$($r['job']) | Part=$($r['part_no']) | Desc=$($r['description']) | Date=$($r['product_date'])"
}
$conn.Close()
