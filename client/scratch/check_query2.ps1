Add-Type -AssemblyName 'System.Data'
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.9;Database=Live_App;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
SELECT TOP 5
    j.job AS Job,
    j.item AS JobItem,
    i.item AS MasterItem,
    jr.oper_num AS OperateNumber,
    jm.item AS MaterialItem,
    RTRIM(LTRIM(tcm.Uf_Color_Name)) AS MaterialColor,
    rm.Uf_PVC_Color AS MaterialPVCColor,
    rm.Uf_Thick AS Thickness,
    rm.Uf_Wide AS Width,
    rm.Uf_Long AS Length,
    jm.matl_qty AS MatlQty,
    jm.sequence AS Sequence,
    jm.description AS MaterialDescription,
    jrm.wc
FROM item_mst AS i
INNER JOIN job_mst AS j ON i.job = j.job
INNER JOIN job_sch_mst AS js ON j.job = js.job AND j.suffix = js.suffix
INNER JOIN jrt_sch_mst AS jr ON js.job = jr.job AND js.suffix = jr.suffix
INNER JOIN jobmatl_mst AS jm ON jr.job = jm.job AND jr.suffix = jm.suffix AND jr.oper_num = jm.oper_num
INNER JOIN jobroute_mst AS jrm ON jrm.job = j.job AND jrm.suffix = j.suffix AND jrm.oper_num = jr.oper_num
LEFT JOIN item_mst AS rm ON jm.item = rm.item
LEFT JOIN T_Color AS tcm ON rm.Uf_Color = tcm.Uf_Color
WHERE jm.item = 'P113814003'
"@
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Output ("Job=" + $r["Job"] + " | JobItem=" + $r["JobItem"] + " | MasterItem=" + $r["MasterItem"] + " | MatlItem=" + $r["MaterialItem"])
}
$r.Close()
$conn.Close()
