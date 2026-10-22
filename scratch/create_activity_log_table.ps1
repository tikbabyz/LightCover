Add-Type -AssemblyName System.Data
$connStr = "Server=192.168.2.214;Database=IIT_DB;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = @"
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'T_PER2_Activity_Log')
    BEGIN
        CREATE TABLE T_PER2_Activity_Log (
            id INT IDENTITY(1,1) PRIMARY KEY,
            module NVARCHAR(50) NOT NULL,
            job NVARCHAR(100) NOT NULL,
            action_type NVARCHAR(50) NOT NULL,
            employee_id NVARCHAR(50) NULL,
            employee_name NVARCHAR(255) NOT NULL,
            role NVARCHAR(50) NOT NULL,
            run_no INT NULL,
            details NVARCHAR(MAX) NULL,
            created_at DATETIME NOT NULL DEFAULT GETDATE()
        );
        
        CREATE INDEX IX_T_PER2_Activity_Log_Job ON T_PER2_Activity_Log(job);
        CREATE INDEX IX_T_PER2_Activity_Log_CreatedAt ON T_PER2_Activity_Log(created_at DESC);
        
        PRINT 'Table T_PER2_Activity_Log created successfully!';
    END
    ELSE
    BEGIN
        PRINT 'Table T_PER2_Activity_Log already exists.';
    END
"@
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "Success executing table creation script."

    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_PER2_Activity_Log'"
    $r = $cmd2.ExecuteReader()
    Write-Host "`nColumns in T_PER2_Activity_Log:"
    while ($r.Read()) {
        Write-Host "- $($r['COLUMN_NAME']) : $($r['DATA_TYPE']) ($($r['CHARACTER_MAXIMUM_LENGTH']))"
    }
    $r.Close()
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
