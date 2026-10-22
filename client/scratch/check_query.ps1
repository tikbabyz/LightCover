Add-Type -AssemblyName 'System.Data'
$conn = New-Object System.Data.SqlClient.SqlConnection('Server=192.168.2.9;Database=Live_App;User Id=sa;Password=P@ssw0rd+IIT;TrustServerCertificate=True;')
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
SELECT TOP 5
    j.job AS Job,
    j.suffix AS Suffix,
    j.item AS JobItem,
    i.item AS MasterItem,
    i.description AS ItemDescription,
    jm.item AS MaterialItem,
    rm.description AS MaterialDescription,
    rm.Uf_Thick AS Thickness,
    rm.Uf_Wide AS Width,
    rm.Uf_Long AS Length,
    RTRIM(LTRIM(tcm.Uf_Color_Name)) AS MaterialColor,
    jm.matl_qty AS MatlQty,
    jm.sequence AS Sequence,
    jr.oper_num AS OperateNumber
FROM jobmatl_mst AS jm
INNER JOIN job_mst AS j ON jm.job = j.job AND jm.suffix = j.suffix
LEFT JOIN item_mst AS i ON j.item = i.item
INNER JOIN job_sch_mst AS js ON j.job = js.job AND j.suffix = js.suffix
INNER JOIN jrt_sch_mst AS jr ON js.job = jr.job AND js.suffix = jr.suffix AND jr.oper_num = jm.oper_num
INNER JOIN jobroute_mst AS jrm ON jrm.job = j.job AND jrm.suffix = j.suffix AND jrm.oper_num = jr.oper_num
LEFT JOIN item_mst AS rm ON jm.item = rm.item
LEFT JOIN T_Color AS tcm ON rm.Uf_Color = tcm.Uf_Color
WHERE jm.item = 'P113814003'
ORDER BY j.job DESC
"@
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Output ("Job=" + $r["Job"] + " | JobItem=" + $r["JobItem"] + " | ItemDesc=" + $r["ItemDescription"] + " | MatlItem=" + $r["MaterialItem"] + " | Thick=" + $r["Thickness"] + " | Wide=" + $r["Width"] + " | Long=" + $r["Length"])
}
$r.Close()
$conn.Close()
