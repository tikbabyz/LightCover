Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'T_PER2_Slit_Head' AND COLUMN_NAME = 'material_no'
)
BEGIN
    ALTER TABLE T_PER2_Slit_Head ADD material_no NVARCHAR(100) NULL;
    PRINT 'Added material_no to T_PER2_Slit_Head successfully!';
END
ELSE
BEGIN
    PRINT 'Column material_no already exists.';
END
"@
$cmd.ExecuteNonQuery() | Out-Null
Write-Host "Done!"
$conn.Close()
