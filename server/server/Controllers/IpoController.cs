using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using server.Models;
using server.Request;
using server.Responses;

namespace server.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class IpoController : ControllerBase
{
    private readonly string LiveApp_connectionString;
    private readonly string IIT_connectionString;
    private static async Task<string> GetDetailLotColumnAsync(SqlConnection connection, SqlTransaction? transaction = null)
    {
        try
        {
            var col = await connection.ExecuteScalarAsync<string>(
                "SELECT TOP 1 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_PER2_IPO_Detail' AND COLUMN_NAME IN ('lot_slit', 'lot_emboss') ORDER BY CASE WHEN COLUMN_NAME = 'lot_slit' THEN 1 ELSE 2 END",
                transaction: transaction);
            return col ?? "lot_slit";
        }
        catch
        {
            return "lot_slit";
        }
    }

    private static async Task<Dictionary<string, bool>> CheckDetailExtraColumnsAsync(SqlConnection connection, SqlTransaction? transaction = null)
    {
        var result = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase)
        {
            ["lot_tap"] = false,
            ["lot_tap_2"] = false,
            ["lot_slit_2"] = false,
            ["roll_slit"] = false,
            ["total_roll_slit"] = false,
            ["roll_slit_2"] = false,
            ["total_roll_slit_2"] = false
        };
        try
        {
            var cols = await connection.QueryAsync<string>(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_PER2_IPO_Detail' AND COLUMN_NAME IN ('lot_tap', 'lot_tap_2', 'lot_slit_2', 'roll_slit', 'total_roll_slit', 'roll_slit_2', 'total_roll_slit_2')",
                transaction: transaction);
            foreach (var col in cols)
            {
                result[col] = true;
            }
        }
        catch { }
        return result;
    }

    private static async Task<bool> CheckExtendedLotColumnsAsync(SqlConnection connection, SqlTransaction? transaction = null)
    {
        try
        {
            var count = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_PER2_IPO_Detail' AND COLUMN_NAME IN ('lot_tap', 'lot_tap_2', 'lot_slit_2')",
                transaction: transaction);
            return (count >= 1);
        }
        catch
        {
            return false;
        }
    }

    public IpoController(IConfiguration configuration)
    {
        LiveApp_connectionString = configuration.GetConnectionString("LiveApp_ConnectionString")!;
        IIT_connectionString = configuration.GetConnectionString("IIT_ConnectionString")!;
    }

    // 1. GET: api/ipo/job/{jobNumber} (ค้นหาข้อมูล Job จากระบบ SyteLine / LiveApp)
    [HttpGet("job/{jobNumber}")]
    public async Task<List<JobResponse>> GetJobTask(string jobNumber)
    {
        await using var connection = new SqlConnection(LiveApp_connectionString);

        var jobSql = @"SELECT jm.job AS Job, job_date AS JobDate, im.item AS Item, im.description AS Description
        , tc.Uf_Color AS ColorCode, im.Uf_PVC_Color AS PvcColor, RTRIM(LTRIM(tc.Uf_Color_Name)) AS ColorName
        , im.Uf_Thick AS Thickness, im.Uf_Wide AS Width, im.Uf_Long AS Length
        , jm.qty_released AS QtyReleased ,im.Uf_Material_Type_New AS MaterialType
        FROM job_mst AS jm
        LEFT JOIN item_mst AS im ON jm.item = im.item
        LEFT JOIN T_Color AS tc ON im.Uf_Color = tc.Uf_Color
        WHERE jm.job = @jobNumber";

        var jobs = await connection.QueryAsync<JobResponse>(jobSql, new { JobNumber = jobNumber });
        return jobs.ToList();
    }
    [HttpGet("bom/{item}")]
    public async Task<List<BomResponse>> GetItemBomTask(string item)
    {
        await using var connection = new SqlConnection(LiveApp_connectionString);

        // ตัดเครื่องหมาย - และ Suffix ออกก่อน เช่น -E, -ADH ตามที่ระบุ
        var searchItem = (item ?? string.Empty).Trim();
        if (searchItem.Contains('-'))
        {
            searchItem = searchItem.Split('-')[0].Trim();
        }

        var bomSql = @"
        SELECT
            i.item AS Item, jr.oper_num AS OperateNumber, jm.item AS MaterialItem,
            RTRIM(LTRIM(tcm.Uf_Color_Name)) AS MaterialColor, rm.Uf_PVC_Color AS MaterialPVCColor,
            rm.Uf_Thick AS Thickness, rm.Uf_Wide AS Width, rm.Uf_Long AS Length,
            jm.matl_qty AS MatlQty, jm.sequence AS Sequence, jm.description AS MaterialDescription, jrm.wc
        FROM item_mst AS i
        INNER JOIN job_mst AS j ON i.job = j.job
        INNER JOIN job_sch_mst AS js ON j.job = js.job AND j.suffix = js.suffix
        INNER JOIN jrt_sch_mst AS jr ON js.job = jr.job AND js.suffix = jr.suffix
        INNER JOIN jobmatl_mst AS jm ON jr.job = jm.job AND jr.suffix = jm.suffix AND jr.oper_num = jm.oper_num
        INNER JOIN jobroute_mst AS jrm ON jrm.job = j.job AND jrm.suffix = j.suffix AND jrm.oper_num = jr.oper_num
        LEFT JOIN item_mst AS rm ON jm.item = rm.item
        LEFT JOIN T_Color AS tcm ON rm.Uf_Color = tcm.Uf_Color
        WHERE i.item = @Item AND j.suffix = 0 
        ORDER BY jm.sequence, jr.oper_num
    ";

        var boms = await connection.QueryAsync<BomResponse>(bomSql, new { Item = searchItem });
        var list = boms.ToList();

        // Fallback: หากตัด - แล้วไม่พบข้อมูล ให้ลองค้นหาด้วย item เดิม หรือกรณีรหัสหลักมีเครื่องหมาย -
        if (list.Count == 0 && searchItem != item?.Trim() && !string.IsNullOrWhiteSpace(item))
        {
            var lastDashIndex = item.LastIndexOf('-');
            if (lastDashIndex > 0)
            {
                var suffixTrimmed = item.Substring(0, lastDashIndex).Trim();
                if (suffixTrimmed != searchItem)
                {
                    var suffixBoms = await connection.QueryAsync<BomResponse>(bomSql, new { Item = suffixTrimmed });
                    list = suffixBoms.ToList();
                    if (list.Count > 0) return list;
                }
            }

            var originalBoms = await connection.QueryAsync<BomResponse>(bomSql, new { Item = item.Trim() });
            list = originalBoms.ToList();
        }

        return list;
    }
    // 2. GET: api/ipo (ค้นหารายการ Head ทั้งหมด หรือตามช่วงวันที่/คำค้นหา)
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? job,
        [FromQuery] string? partNo,
        [FromQuery] string? keyword,
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        using var connection = new SqlConnection(IIT_connectionString);

        string sql = @"
            SELECT TOP 500 id, job, part_no AS PartNo, description, 
                   lot_number AS LotNumber, employee_name AS EmployeeName, 
                   prod_name AS ProdName, tube1_spec AS Tube1Spec, tube2_spec AS Tube2Spec, 
                   downtime_note AS DowntimeNote, status AS Status, 
                   created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM T_PER2_IPO_Head
            WHERE (@Job IS NULL OR job LIKE '%' + @Job + '%')
              AND (@PartNo IS NULL OR part_no LIKE '%' + @PartNo + '%')
              AND (@StartDate IS NULL OR lot_number >= @StartDate)
              AND (@EndDate IS NULL OR lot_number <= @EndDate)
              AND (@Keyword IS NULL OR (
                    job LIKE '%' + @Keyword + '%' OR
                    part_no LIKE '%' + @Keyword + '%' OR
                    description LIKE '%' + @Keyword + '%' OR
                    employee_name LIKE '%' + @Keyword + '%' OR
                    prod_name LIKE '%' + @Keyword + '%'
              ))
            ORDER BY lot_number DESC, id DESC";

        var result = await connection.QueryAsync<IpoHead>(sql, new
        {
            Job = job,
            PartNo = partNo,
            StartDate = startDate,
            EndDate = endDate,
            Keyword = keyword
        });
        return Ok(result);
    }

    // 3. GET: api/ipo/full (ดึงรายการใบงานครบชุดพร้อม Details และผลการตรวจสอบ สำหรับหน้ารายการและประวัติ)
    [HttpGet("full")]
    public async Task<IActionResult> GetFullJobs(
        [FromQuery] string? job,
        [FromQuery] string? partNo,
        [FromQuery] string? keyword,
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        using var connection = new SqlConnection(IIT_connectionString);

        string sqlHead = @"
            SELECT TOP 500 id, job, part_no AS PartNo, description, 
                   lot_number AS LotNumber, employee_name AS EmployeeName, 
                   prod_name AS ProdName, tube1_spec AS Tube1Spec, tube2_spec AS Tube2Spec, 
                   downtime_note AS DowntimeNote, status AS Status, 
                   created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM T_PER2_IPO_Head
            WHERE (@Job IS NULL OR job LIKE '%' + @Job + '%')
              AND (@PartNo IS NULL OR part_no LIKE '%' + @PartNo + '%')
              AND (@StartDate IS NULL OR lot_number >= @StartDate)
              AND (@EndDate IS NULL OR lot_number <= @EndDate)
              AND (@Keyword IS NULL OR (
                    job LIKE '%' + @Keyword + '%' OR
                    part_no LIKE '%' + @Keyword + '%' OR
                    description LIKE '%' + @Keyword + '%' OR
                    employee_name LIKE '%' + @Keyword + '%' OR
                    prod_name LIKE '%' + @Keyword + '%'
              ))
            ORDER BY lot_number DESC, id DESC";

        var heads = (await connection.QueryAsync<IpoHead>(sqlHead, new
        {
            Job = job,
            PartNo = partNo,
            StartDate = startDate,
            EndDate = endDate,
            Keyword = keyword
        })).ToList();

        if (!heads.Any())
        {
            return Ok(new List<object>());
        }

        var jobList = heads.Select(h => h.Job).Distinct().ToList();

        // Query Details, Temps, Defects, Tube1, Tube2 with explicit column aliases
        string lotCol = await GetDetailLotColumnAsync(connection);
        var extraCols = await CheckDetailExtraColumnsAsync(connection);
        var sbExt = new System.Text.StringBuilder();
        if (extraCols["lot_tap"]) sbExt.Append(", lot_tap AS LotTap");
        if (extraCols["lot_tap_2"]) sbExt.Append(", lot_tap_2 AS LotTap2");
        if (extraCols["lot_slit_2"]) sbExt.Append(", lot_slit_2 AS LotSlit2");
        if (extraCols["roll_slit"]) sbExt.Append(", roll_slit AS RollSlit");
        if (extraCols["total_roll_slit"]) sbExt.Append(", total_roll_slit AS TotalRollSlit");
        if (extraCols["roll_slit_2"]) sbExt.Append(", roll_slit_2 AS RollSlit2");
        if (extraCols["total_roll_slit_2"]) sbExt.Append(", total_roll_slit_2 AS TotalRollSlit2");
        string extSelect = sbExt.ToString();
        string sqlDetails = $@"
            SELECT id, job, run_no AS RunNo, {lotCol} AS LotSlit, {lotCol} AS LotEmboss, start_time AS StartTime, 
                   end_time AS EndTime, total_meters AS TotalMeters, downtime_note AS DowntimeNote, 
                   employee_name AS EmployeeName, created_at AS CreatedAt{extSelect} 
            FROM T_PER2_IPO_Detail 
            WHERE job IN @JobList ORDER BY run_no ASC";

        string sqlTemps = @"
            SELECT id, job, detail_run_no AS DetailRunNo, speed AS Speed, temp1 AS Temp1, 
                   temp2 AS Temp2, temp3 AS Temp3, temp4 AS Temp4, temp_pipe AS TempPipe, created_at AS CreatedAt 
            FROM T_PER2_IPO_Temperature 
            WHERE job IN @JobList ORDER BY detail_run_no ASC";

        string sqlDefects = @"
            SELECT id, job, detail_run_no AS DetailRunNo, setting_machine AS SettingMachine, 
                   joint_ipo AS JointIpo, split_seam AS SplitSeam, dimension_ng AS DimensionNg, 
                   foam_detached AS FoamDetached, joint_mark AS JointMark, thick_ng AS ThickNg, 
                   film_blemish AS FilmBlemish, other_ng AS OtherNg 
            FROM T_PER2_IPO_Defect 
            WHERE job IN @JobList ORDER BY detail_run_no ASC";

        string sqlTube1 = @"
            SELECT id, job, detail_run_no AS DetailRunNo, inside_dia_1 AS InsideDia1, 
                   inside_dia_2 AS InsideDia2, inside_dia_avg AS InsideDiaAvg, 
                   thickness_1 AS Thickness1, thickness_2 AS Thickness2, thickness_3 AS Thickness3, 
                   thickness_4 AS Thickness4, thickness_avg AS ThicknessAvg, judgement AS Judgement, created_at AS CreatedAt 
            FROM T_PER2_IPO_Tube1 
            WHERE job IN @JobList ORDER BY detail_run_no ASC";

        string sqlTube2 = @"
            SELECT id, job, detail_run_no AS DetailRunNo, inside_dia_1 AS InsideDia1, 
                   inside_dia_2 AS InsideDia2, inside_dia_avg AS InsideDiaAvg, 
                   thickness_1 AS Thickness1, thickness_2 AS Thickness2, thickness_3 AS Thickness3, 
                   thickness_4 AS Thickness4, thickness_avg AS ThicknessAvg, judgement AS Judgement, created_at AS CreatedAt 
            FROM T_PER2_IPO_Tube2 
            WHERE job IN @JobList ORDER BY detail_run_no ASC";

        var details = (await connection.QueryAsync<IpoDetail>(sqlDetails, new { JobList = jobList })).ToList();
        var temps = (await connection.QueryAsync<IpoTemperature>(sqlTemps, new { JobList = jobList })).ToList();
        var defects = (await connection.QueryAsync<IpoDefect>(sqlDefects, new { JobList = jobList })).ToList();
        var tube1List = (await connection.QueryAsync<IpoTube1>(sqlTube1, new { JobList = jobList })).ToList();
        var tube2List = (await connection.QueryAsync<IpoTube2>(sqlTube2, new { JobList = jobList })).ToList();

        var detailsByJob = details.GroupBy(d => d.Job).ToDictionary(g => g.Key, g => g.ToList());
        var tempsByJob = temps.GroupBy(t => t.Job).ToDictionary(g => g.Key, g => g.ToList());
        var defectsByJob = defects.GroupBy(d => d.Job).ToDictionary(g => g.Key, g => g.ToList());
        var tube1ByJob = tube1List.GroupBy(t => t.Job).ToDictionary(g => g.Key, g => g.ToList());
        var tube2ByJob = tube2List.GroupBy(t => t.Job).ToDictionary(g => g.Key, g => g.ToList());

        var fullJobs = heads.Select((h, index) =>
        {
            var jobDetails = detailsByJob.TryGetValue(h.Job, out var dList) ? dList : new List<IpoDetail>();
            var jobTemps = tempsByJob.TryGetValue(h.Job, out var tList) ? tList : new List<IpoTemperature>();
            var jobDefects = defectsByJob.TryGetValue(h.Job, out var def) ? def : new List<IpoDefect>();
            var jobTube1 = tube1ByJob.TryGetValue(h.Job, out var t1) ? t1 : new List<IpoTube1>();
            var jobTube2 = tube2ByJob.TryGetValue(h.Job, out var t2) ? t2 : new List<IpoTube2>();

            var totalMeters = jobDetails.Sum(d => d.TotalMeters);
            var totalRolls = jobDetails.Count;

            return new
            {
                id = h.Id,
                sequenceNo = index + 1,
                jobNo = h.Job,
                partNo = h.PartNo,
                description = h.Description,
                lotNumber = h.LotNumber.ToString("yyyy-MM-dd"),
                employeeName = h.EmployeeName,
                productName = h.ProdName,
                tube1Spec = h.Tube1Spec,
                tube2Spec = h.Tube2Spec,
                downtimeNote = h.DowntimeNote,
                status = h.Status,
                totalMeters = totalMeters,
                totalRolls = totalRolls,
                createdAt = h.CreatedAt,
                updatedAt = h.UpdatedAt,
                details = jobDetails,
                temperatures = jobTemps,
                defects = jobDefects,
                tube1List = jobTube1,
                tube2List = jobTube2
            };
        });

        return Ok(fullJobs);
    }

    // 3.5 GET: api/ipo/summary-report (สรุปรายงานสถิติการผลิตประจำเดือน/ช่วงวันที่)
    [HttpGet("summary-report")]
    public async Task<IActionResult> GetSummaryReport(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        using var connection = new SqlConnection(IIT_connectionString);

        string sqlSummary = @"
            SELECT 
                COUNT(DISTINCT h.job) AS TotalJobs,
                COUNT(d.id) AS TotalRolls,
                ISNULL(SUM(d.total_meters), 0) AS TotalMeters,
                ISNULL(SUM(ISNULL(def.setting_machine, 0) + ISNULL(def.joint_ipo, 0) + ISNULL(def.split_seam, 0) + 
                          ISNULL(def.dimension_ng, 0) + ISNULL(def.foam_detached, 0) + ISNULL(def.joint_mark, 0) + 
                          ISNULL(def.thick_ng, 0) + ISNULL(def.film_blemish, 0) + ISNULL(def.other_ng, 0)), 0) AS TotalDefectMeters,
                ISNULL(SUM(def.setting_machine), 0) AS DefectSettingMachine,
                ISNULL(SUM(def.joint_ipo), 0) AS DefectJointIpo,
                ISNULL(SUM(def.split_seam), 0) AS DefectSplitSeam,
                ISNULL(SUM(def.dimension_ng), 0) AS DefectDimensionNg,
                ISNULL(SUM(def.foam_detached), 0) AS DefectFoamDetached,
                ISNULL(SUM(def.joint_mark), 0) AS DefectJointMark,
                ISNULL(SUM(def.thick_ng), 0) AS DefectThickNg,
                ISNULL(SUM(def.film_blemish), 0) AS DefectFilmBlemish,
                ISNULL(SUM(def.other_ng), 0) AS DefectOtherNg
            FROM T_PER2_IPO_Head h
            LEFT JOIN T_PER2_IPO_Detail d ON h.job = d.job
            LEFT JOIN T_PER2_IPO_Defect def ON d.job = def.job AND d.run_no = def.detail_run_no
            WHERE (@StartDate IS NULL OR h.lot_number >= @StartDate)
              AND (@EndDate IS NULL OR h.lot_number <= @EndDate)";

        var summary = await connection.QueryFirstOrDefaultAsync(sqlSummary, new { StartDate = startDate, EndDate = endDate });

        string sqlByPart = @"
            SELECT 
                h.part_no AS PartNo,
                h.prod_name AS ProdName,
                h.description AS Description,
                COUNT(DISTINCT h.job) AS JobCount,
                COUNT(d.id) AS RollCount,
                ISNULL(SUM(d.total_meters), 0) AS TotalMeters,
                ISNULL(SUM(ISNULL(def.setting_machine, 0) + ISNULL(def.joint_ipo, 0) + ISNULL(def.split_seam, 0) + 
                          ISNULL(def.dimension_ng, 0) + ISNULL(def.foam_detached, 0) + ISNULL(def.joint_mark, 0) + 
                          ISNULL(def.thick_ng, 0) + ISNULL(def.film_blemish, 0) + ISNULL(def.other_ng, 0)), 0) AS TotalDefect
            FROM T_PER2_IPO_Head h
            LEFT JOIN T_PER2_IPO_Detail d ON h.job = d.job
            LEFT JOIN T_PER2_IPO_Defect def ON d.job = def.job AND d.run_no = def.detail_run_no
            WHERE (@StartDate IS NULL OR h.lot_number >= @StartDate)
              AND (@EndDate IS NULL OR h.lot_number <= @EndDate)
            GROUP BY h.part_no, h.prod_name, h.description
            ORDER BY TotalMeters DESC";

        var byPart = await connection.QueryAsync(sqlByPart, new { StartDate = startDate, EndDate = endDate });

        string sqlByDate = @"
            SELECT 
                h.lot_number AS ProductionDate,
                COUNT(DISTINCT h.job) AS JobCount,
                COUNT(d.id) AS RollCount,
                ISNULL(SUM(d.total_meters), 0) AS TotalMeters,
                ISNULL(SUM(ISNULL(def.setting_machine, 0) + ISNULL(def.joint_ipo, 0) + ISNULL(def.split_seam, 0) + 
                          ISNULL(def.dimension_ng, 0) + ISNULL(def.foam_detached, 0) + ISNULL(def.joint_mark, 0) + 
                          ISNULL(def.thick_ng, 0) + ISNULL(def.film_blemish, 0) + ISNULL(def.other_ng, 0)), 0) AS TotalDefect
            FROM T_PER2_IPO_Head h
            LEFT JOIN T_PER2_IPO_Detail d ON h.job = d.job
            LEFT JOIN T_PER2_IPO_Defect def ON d.job = def.job AND d.run_no = def.detail_run_no
            WHERE (@StartDate IS NULL OR h.lot_number >= @StartDate)
              AND (@EndDate IS NULL OR h.lot_number <= @EndDate)
            GROUP BY h.lot_number
            ORDER BY h.lot_number ASC";

        var byDate = await connection.QueryAsync(sqlByDate, new { StartDate = startDate, EndDate = endDate });

        string sqlDowntimes = @"
            SELECT h.job, h.lot_number AS LotNumber, d.run_no AS RunNo, d.downtime_note AS DowntimeNote
            FROM T_PER2_IPO_Detail d
            INNER JOIN T_PER2_IPO_Head h ON d.job = h.job
            WHERE (@StartDate IS NULL OR h.lot_number >= @StartDate)
              AND (@EndDate IS NULL OR h.lot_number <= @EndDate)
              AND d.downtime_note IS NOT NULL AND LTRIM(RTRIM(d.downtime_note)) != ''";

        var downtimes = await connection.QueryAsync(sqlDowntimes, new { StartDate = startDate, EndDate = endDate });

        return Ok(new {
            summary = summary,
            byPart = byPart,
            byDate = byDate,
            downtimes = downtimes
        });
    }

    // 4. GET: api/ipo/{job} (ดึงข้อมูล 1 ใบงานแบบครบทุกตาราง)
    [HttpGet("{job}")]
    public async Task<IActionResult> GetByJob(string job)
    {
        using var connection = new SqlConnection(IIT_connectionString);

        string sqlHead = @"
            SELECT id, job, part_no AS PartNo, description, 
                   lot_number AS LotNumber, employee_name AS EmployeeName, 
                   prod_name AS ProdName, tube1_spec AS Tube1Spec, tube2_spec AS Tube2Spec, 
                   downtime_note AS DowntimeNote, status AS Status, 
                   created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM T_PER2_IPO_Head
            WHERE job = @Job";

        var head = await connection.QueryFirstOrDefaultAsync<IpoHead>(sqlHead, new { Job = job });
        if (head == null)
        {
            return NotFound(new { message = $"ไม่พบข้อมูล Job: {job}" });
        }

        string lotCol = await GetDetailLotColumnAsync(connection);
        var extraCols = await CheckDetailExtraColumnsAsync(connection);
        var sbExt = new System.Text.StringBuilder();
        if (extraCols["lot_tap"]) sbExt.Append(", lot_tap AS LotTap");
        if (extraCols["lot_tap_2"]) sbExt.Append(", lot_tap_2 AS LotTap2");
        if (extraCols["lot_slit_2"]) sbExt.Append(", lot_slit_2 AS LotSlit2");
        if (extraCols["roll_slit"]) sbExt.Append(", roll_slit AS RollSlit");
        if (extraCols["total_roll_slit"]) sbExt.Append(", total_roll_slit AS TotalRollSlit");
        if (extraCols["roll_slit_2"]) sbExt.Append(", roll_slit_2 AS RollSlit2");
        if (extraCols["total_roll_slit_2"]) sbExt.Append(", total_roll_slit_2 AS TotalRollSlit2");
        string extSelect = sbExt.ToString();
        string sqlDetails = $@"
            SELECT id, job, run_no AS RunNo, {lotCol} AS LotSlit, {lotCol} AS LotEmboss, start_time AS StartTime, 
                   end_time AS EndTime, total_meters AS TotalMeters, downtime_note AS DowntimeNote, 
                   employee_name AS EmployeeName, created_at AS CreatedAt{extSelect} 
            FROM T_PER2_IPO_Detail 
            WHERE job = @Job ORDER BY run_no ASC";

        string sqlTemps = @"
            SELECT id, job, detail_run_no AS DetailRunNo, speed AS Speed, temp1 AS Temp1, 
                   temp2 AS Temp2, temp3 AS Temp3, temp4 AS Temp4, temp_pipe AS TempPipe, created_at AS CreatedAt 
            FROM T_PER2_IPO_Temperature 
            WHERE job = @Job ORDER BY detail_run_no ASC";

        string sqlDefects = @"
            SELECT id, job, detail_run_no AS DetailRunNo, setting_machine AS SettingMachine, 
                   joint_ipo AS JointIpo, split_seam AS SplitSeam, dimension_ng AS DimensionNg, 
                   foam_detached AS FoamDetached, joint_mark AS JointMark, thick_ng AS ThickNg, 
                   film_blemish AS FilmBlemish, other_ng AS OtherNg 
            FROM T_PER2_IPO_Defect 
            WHERE job = @Job ORDER BY detail_run_no ASC";

        string sqlTube1 = @"
            SELECT id, job, detail_run_no AS DetailRunNo, inside_dia_1 AS InsideDia1, 
                   inside_dia_2 AS InsideDia2, inside_dia_avg AS InsideDiaAvg, 
                   thickness_1 AS Thickness1, thickness_2 AS Thickness2, thickness_3 AS Thickness3, 
                   thickness_4 AS Thickness4, thickness_avg AS ThicknessAvg, judgement AS Judgement, created_at AS CreatedAt 
            FROM T_PER2_IPO_Tube1 
            WHERE job = @Job ORDER BY detail_run_no ASC";

        string sqlTube2 = @"
            SELECT id, job, detail_run_no AS DetailRunNo, inside_dia_1 AS InsideDia1, 
                   inside_dia_2 AS InsideDia2, inside_dia_avg AS InsideDiaAvg, 
                   thickness_1 AS Thickness1, thickness_2 AS Thickness2, thickness_3 AS Thickness3, 
                   thickness_4 AS Thickness4, thickness_avg AS ThicknessAvg, judgement AS Judgement, created_at AS CreatedAt 
            FROM T_PER2_IPO_Tube2 
            WHERE job = @Job ORDER BY detail_run_no ASC";

        var details = (await connection.QueryAsync<IpoDetail>(sqlDetails, new { Job = job })).ToList();
        var temps = (await connection.QueryAsync<IpoTemperature>(sqlTemps, new { Job = job })).ToList();
        var defects = (await connection.QueryAsync<IpoDefect>(sqlDefects, new { Job = job })).ToList();
        var tube1List = (await connection.QueryAsync<IpoTube1>(sqlTube1, new { Job = job })).ToList();
        var tube2List = (await connection.QueryAsync<IpoTube2>(sqlTube2, new { Job = job })).ToList();

        return Ok(new
        {
            head = head,
            details = details,
            temperatures = temps,
            defects = defects,
            tube1List = tube1List,
            tube2List = tube2List
        });
    }

    // 5. POST: api/ipo/save หรือ api/ipo (บันทึกสร้างใบงานใหม่ หรือแก้ไขหากระบุ IsEdit)
    [HttpPost("save")]
    [HttpPost]
    public async Task<IActionResult> Save([FromBody] IpoSaveRequest request)
    {
        if (request == null || request.Head == null || string.IsNullOrWhiteSpace(request.Head.Job))
        {
            return BadRequest(new { message = "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน" });
        }

        using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        try
        {
            var now = DateTime.Now;
            NormalizeIpoRequest(request, now);

            string sqlCheck = "SELECT COUNT(1) FROM T_PER2_IPO_Head WHERE job = @Job";
            int exists = await connection.ExecuteScalarAsync<int>(sqlCheck, new { request.Head.Job }, transaction);

            if (exists > 0)
            {
                // หากมี Job นี้ในระบบแล้ว ให้ทำการอัปเดตข้อมูลอัตโนมัติ (UPSERT)
                return await ExecuteUpdateInternal(connection, transaction, request);
            }

            // INSERT Head
            string sqlInsertHead = @"
                INSERT INTO T_PER2_IPO_Head 
                (job, part_no, description, lot_number, employee_name, prod_name, tube1_spec, tube2_spec, downtime_note, status, created_at, updated_at)
                VALUES 
                (@Job, @PartNo, @Description, @LotNumber, @EmployeeName, @ProdName, @Tube1Spec, @Tube2Spec, @DowntimeNote, @Status, @CreatedAt, @UpdatedAt)";
            await connection.ExecuteAsync(sqlInsertHead, request.Head, transaction);

            // INSERT Child tables
            await InsertChildTables(connection, transaction, request, now);

            transaction.Commit();
            return Ok(new { message = "บันทึกข้อมูล IPO TUBE เรียบร้อย", job = request.Head.Job });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IpoController Save ERROR] {ex}");
            transaction.Rollback();
            return StatusCode(500, new { message = $"เกิดข้อผิดพลาดในการบันทึกข้อมูล: {ex.Message}", error = ex.ToString() });
        }
    }

    // 6. PUT: api/ipo/update หรือ api/ipo (อัปเดตแก้ไขใบงานเดิม หรือสร้างใหม่หากยังไม่มี)
    [HttpPut("update")]
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] IpoSaveRequest request)
    {
        if (request == null || request.Head == null || string.IsNullOrWhiteSpace(request.Head.Job))
        {
            return BadRequest(new { message = "ข้อมูลไม่ถูกต้อง" });
        }

        using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        try
        {
            var now = DateTime.Now;
            NormalizeIpoRequest(request, now);

            string sqlCheck = "SELECT COUNT(1) FROM T_PER2_IPO_Head WHERE job = @Job";
            int exists = await connection.ExecuteScalarAsync<int>(sqlCheck, new { request.Head.Job }, transaction);

            if (exists == 0)
            {
                // หากยังไม่มี Job ในระบบ ให้ทำการสร้างใหม่แบบ UPSERT อัตโนมัติ เพื่อป้องกัน 404
                string sqlInsertHead = @"
                    INSERT INTO T_PER2_IPO_Head 
                    (job, part_no, description, lot_number, employee_name, prod_name, tube1_spec, tube2_spec, downtime_note, status, created_at, updated_at)
                    VALUES 
                    (@Job, @PartNo, @Description, @LotNumber, @EmployeeName, @ProdName, @Tube1Spec, @Tube2Spec, @DowntimeNote, @Status, @CreatedAt, @UpdatedAt)";
                await connection.ExecuteAsync(sqlInsertHead, request.Head, transaction);

                await InsertChildTables(connection, transaction, request, now);

                transaction.Commit();
                return Ok(new { message = "บันทึกข้อมูล IPO TUBE เรียบร้อย", job = request.Head.Job });
            }

            return await ExecuteUpdateInternal(connection, transaction, request);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IpoController Update ERROR] {ex}");
            transaction.Rollback();
            return StatusCode(500, new { message = $"เกิดข้อผิดพลาดในการอัปเดตข้อมูล: {ex.Message}", error = ex.ToString() });
        }
    }

    // 7. DELETE: api/ipo?job=xxx หรือ api/ipo/{job} (ลบทั้ง Job)
    [HttpDelete("{job}")]
    [HttpDelete]
    public async Task<IActionResult> Delete(string? job = null)
    {
        if (string.IsNullOrWhiteSpace(job))
        {
            return BadRequest(new { message = "กรุณาระบุหมายเลข Job ที่ต้องการลบ" });
        }

        using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        try
        {
            // ลบตารางลูกก่อน
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Detail WHERE job = @Job", new { Job = job }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Temperature WHERE job = @Job", new { Job = job }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Defect WHERE job = @Job", new { Job = job }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube1 WHERE job = @Job", new { Job = job }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube2 WHERE job = @Job", new { Job = job }, transaction);

            // ลบตารางหลัก
            int rows = await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Head WHERE job = @Job", new { Job = job }, transaction);

            transaction.Commit();
            return Ok(new { message = $"ลบข้อมูล Job {job} สำเร็จ", affectedRows = rows });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IpoController Delete ERROR] {ex}");
            transaction.Rollback();
            return StatusCode(500, new { message = $"เกิดข้อผิดพลาดในการลบ: {ex.Message}", error = ex.ToString() });
        }
    }

    // 8. DELETE: api/ipo/{job}/roll/{runNo} (ลบเฉพาะรอบที่ระบุ)
    [HttpDelete("{job}/roll/{runNo}")]
    public async Task<IActionResult> DeleteRoll(string job, int runNo)
    {
        if (string.IsNullOrWhiteSpace(job) || runNo <= 0)
        {
            return BadRequest(new { message = "ข้อมูล Job หรือ Run No ไม่ถูกต้อง" });
        }

        using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        try
        {
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Detail WHERE job = @Job AND run_no = @RunNo", new { Job = job, RunNo = runNo }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Temperature WHERE job = @Job AND detail_run_no = @RunNo", new { Job = job, RunNo = runNo }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Defect WHERE job = @Job AND detail_run_no = @RunNo", new { Job = job, RunNo = runNo }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube1 WHERE job = @Job AND detail_run_no = @RunNo", new { Job = job, RunNo = runNo }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube2 WHERE job = @Job AND detail_run_no = @RunNo", new { Job = job, RunNo = runNo }, transaction);

            // เช็คว่าเหลือรอบอื่นใน Job นี้หรือไม่
            int remainingDetails = await connection.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM T_PER2_IPO_Detail WHERE job = @Job", new { Job = job }, transaction);
            if (remainingDetails == 0)
            {
                await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Head WHERE job = @Job", new { Job = job }, transaction);
            }

            transaction.Commit();
            return Ok(new { message = $"ลบข้อมูลรอบที่ {runNo} ของ Job {job} สำเร็จ", remainingRolls = remainingDetails });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IpoController DeleteRoll ERROR] {ex}");
            transaction.Rollback();
            return StatusCode(500, new { message = $"เกิดข้อผิดพลาดในการลบรอบ: {ex.Message}", error = ex.ToString() });
        }
    }

    /// <summary>
    /// Helper: ประมวลผลการ UPDATE Head + ลบ Child เก่า + บันทึก Child ใหม่ใน Transaction เดียวกัน
    /// </summary>
    private async Task<IActionResult> ExecuteUpdateInternal(SqlConnection connection, SqlTransaction transaction, IpoSaveRequest request)
    {
        var now = DateTime.Now;
        NormalizeIpoRequest(request, now);

        string sqlUpdateHead = @"
            UPDATE T_PER2_IPO_Head
            SET part_no = CASE WHEN @PartNo IS NOT NULL AND @PartNo <> '' THEN @PartNo ELSE part_no END,
                description = CASE WHEN @Description IS NOT NULL AND @Description <> '' THEN @Description ELSE description END,
                lot_number = CASE WHEN @LotNumber > '1900-01-01' THEN @LotNumber ELSE lot_number END,
                employee_name = CASE WHEN @EmployeeName IS NOT NULL AND @EmployeeName <> '' THEN @EmployeeName ELSE employee_name END,
                prod_name = CASE WHEN @ProdName IS NOT NULL AND @ProdName <> '' THEN @ProdName ELSE prod_name END,
                tube1_spec = CASE WHEN @Tube1Spec IS NOT NULL AND @Tube1Spec <> '' THEN @Tube1Spec ELSE tube1_spec END,
                tube2_spec = @Tube2Spec,
                downtime_note = CASE WHEN @DowntimeNote IS NOT NULL THEN @DowntimeNote ELSE downtime_note END,
                status = CASE WHEN @Status IS NOT NULL AND @Status <> '' THEN @Status ELSE status END,
                updated_at = @UpdatedAt
            WHERE job = @Job";
        await connection.ExecuteAsync(sqlUpdateHead, request.Head, transaction);

        // หากมีการส่ง Details มาด้วย ให้แทนที่ Child ตารางลูก
        // แต่ถ้าไม่มี Details ส่งมา (เช่น อัปเดตเฉพาะสถานะ หรือ ปิด Job) ให้คงข้อมูล Details เดิมไว้
        if (request.Details != null && request.Details.Any())
        {
            string jobParam = request.Head.Job;
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Detail WHERE job = @Job", new { Job = jobParam }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Temperature WHERE job = @Job", new { Job = jobParam }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Defect WHERE job = @Job", new { Job = jobParam }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube1 WHERE job = @Job", new { Job = jobParam }, transaction);
            await connection.ExecuteAsync("DELETE FROM T_PER2_IPO_Tube2 WHERE job = @Job", new { Job = jobParam }, transaction);

            // INSERT Child ใหม่
            await InsertChildTables(connection, transaction, request, now);
        }

        transaction.Commit();
        return Ok(new { message = "อัปเดตข้อมูล IPO TUBE เรียบร้อย", job = request.Head.Job });
    }

    /// <summary>
    /// Helper: ตรวจสอบและปรับปรุงข้อมูลให้พร้อมสำหรับ SQL Server ป้องกัน NULL / SqlDateTime overflow
    /// </summary>
    private static void NormalizeIpoRequest(IpoSaveRequest request, DateTime now)
    {
        if (request?.Head == null) return;

        var minSqlDate = new DateTime(1753, 1, 1);
        if (request.Head.CreatedAt < minSqlDate) request.Head.CreatedAt = now;
        if (request.Head.UpdatedAt < minSqlDate) request.Head.UpdatedAt = now;
        if (request.Head.LotNumber < minSqlDate) request.Head.LotNumber = DateTime.Today;

        request.Head.Job = (request.Head.Job ?? string.Empty).Trim();
        request.Head.PartNo = (request.Head.PartNo ?? string.Empty).Trim();
        request.Head.Description = (request.Head.Description ?? string.Empty).Trim();
        request.Head.EmployeeName = (request.Head.EmployeeName ?? string.Empty).Trim();
        request.Head.ProdName = (request.Head.ProdName ?? string.Empty).Trim();
        request.Head.Tube1Spec = string.IsNullOrWhiteSpace(request.Head.Tube1Spec) ? "2" : request.Head.Tube1Spec.Trim();
        if (!string.IsNullOrWhiteSpace(request.Head.Tube2Spec))
        {
            request.Head.Tube2Spec = request.Head.Tube2Spec.Trim();
        }
        else if (request.Tube2List != null && request.Tube2List.Any())
        {
            request.Head.Tube2Spec = "3";
        }
        else
        {
            request.Head.Tube2Spec = null;
        }
        request.Head.Status = string.IsNullOrWhiteSpace(request.Head.Status) ? "IN_PROGRESS" : request.Head.Status.Trim();

        if (request.Details != null)
        {
            foreach (var d in request.Details)
            {
                d.Job = request.Head.Job;
                if (string.IsNullOrWhiteSpace(d.LotSlit) && !string.IsNullOrWhiteSpace(d.LotEmboss))
                {
                    d.LotSlit = d.LotEmboss.Trim();
                }
                else
                {
                    d.LotSlit = (d.LotSlit ?? string.Empty).Trim();
                }
                d.LotTap = string.IsNullOrWhiteSpace(d.LotTap) ? null : d.LotTap.Trim();
                d.LotTap2 = string.IsNullOrWhiteSpace(d.LotTap2) ? null : d.LotTap2.Trim();
                d.LotSlit2 = string.IsNullOrWhiteSpace(d.LotSlit2) ? null : d.LotSlit2.Trim();
                d.StartTime = (d.StartTime ?? string.Empty).Trim();
                d.EndTime = (d.EndTime ?? string.Empty).Trim();
                d.EmployeeName = string.IsNullOrWhiteSpace(d.EmployeeName) ? (request.Head.EmployeeName ?? string.Empty).Trim() : d.EmployeeName.Trim();
                if (d.CreatedAt < minSqlDate) d.CreatedAt = now;
            }
        }

        if (request.Temperatures != null)
        {
            foreach (var t in request.Temperatures)
            {
                t.Job = request.Head.Job;
                if (t.CreatedAt < minSqlDate) t.CreatedAt = now;
            }
        }

        if (request.Defects != null)
        {
            foreach (var def in request.Defects)
            {
                def.Job = request.Head.Job;
            }
        }

        if (request.Tube1List != null)
        {
            foreach (var t1 in request.Tube1List)
            {
                t1.Job = request.Head.Job;
                t1.Judgement = string.IsNullOrWhiteSpace(t1.Judgement) ? "OK" : t1.Judgement.Trim();
                if (t1.CreatedAt < minSqlDate) t1.CreatedAt = now;
            }
        }

        if (request.Tube2List != null)
        {
            foreach (var t2 in request.Tube2List)
            {
                t2.Job = request.Head.Job;
                t2.Judgement = string.IsNullOrWhiteSpace(t2.Judgement) ? null : t2.Judgement.Trim();
                if (t2.CreatedAt < minSqlDate) t2.CreatedAt = now;
            }
        }
    }

    /// <summary>
    /// Helper: บันทึกข้อมูลตารางลูก (Details, Temps, Defects, Tube1, Tube2)
    /// </summary>
    private static async Task InsertChildTables(SqlConnection connection, SqlTransaction transaction, IpoSaveRequest request, DateTime now)
    {
        string job = request.Head.Job;

        // 1. Details
        if (request.Details != null && request.Details.Any())
        {
            string lotCol = await GetDetailLotColumnAsync(connection, transaction);
            var extraCols = await CheckDetailExtraColumnsAsync(connection, transaction);
            var colList = new List<string>();
            var valList = new List<string>();
            if (extraCols["lot_tap"]) { colList.Add("lot_tap"); valList.Add("@LotTap"); }
            if (extraCols["lot_tap_2"]) { colList.Add("lot_tap_2"); valList.Add("@LotTap2"); }
            if (extraCols["lot_slit_2"]) { colList.Add("lot_slit_2"); valList.Add("@LotSlit2"); }
            if (extraCols["roll_slit"]) { colList.Add("roll_slit"); valList.Add("@RollSlit"); }
            if (extraCols["total_roll_slit"]) { colList.Add("total_roll_slit"); valList.Add("@TotalRollSlit"); }
            if (extraCols["roll_slit_2"]) { colList.Add("roll_slit_2"); valList.Add("@RollSlit2"); }
            if (extraCols["total_roll_slit_2"]) { colList.Add("total_roll_slit_2"); valList.Add("@TotalRollSlit2"); }

            string extCols = colList.Count > 0 ? ", " + string.Join(", ", colList) : "";
            string extVals = valList.Count > 0 ? ", " + string.Join(", ", valList) : "";
            string sqlInsertDetail = $@"
                INSERT INTO T_PER2_IPO_Detail 
                (job, run_no, {lotCol}, start_time, end_time, total_meters, downtime_note, employee_name, created_at{extCols})
                VALUES 
                (@Job, @RunNo, @LotSlit, @StartTime, @EndTime, @TotalMeters, @DowntimeNote, @EmployeeName, @CreatedAt{extVals})";

            foreach (var d in request.Details)
            {
                d.Job = job;
                if (d.CreatedAt == default) d.CreatedAt = now;
                await connection.ExecuteAsync(sqlInsertDetail, d, transaction);
            }
        }

        // 2. Temperatures
        if (request.Temperatures != null && request.Temperatures.Any())
        {
            string sqlInsertTemp = @"
                INSERT INTO T_PER2_IPO_Temperature 
                (job, detail_run_no, speed, temp1, temp2, temp3, temp4, temp_pipe, created_at)
                VALUES 
                (@Job, @DetailRunNo, @Speed, @Temp1, @Temp2, @Temp3, @Temp4, @TempPipe, @CreatedAt)";

            foreach (var t in request.Temperatures)
            {
                t.Job = job;
                if (t.CreatedAt == default) t.CreatedAt = now;
                await connection.ExecuteAsync(sqlInsertTemp, t, transaction);
            }
        }

        // 3. Defects
        if (request.Defects != null && request.Defects.Any())
        {
            string sqlInsertDefect = @"
                INSERT INTO T_PER2_IPO_Defect 
                (job, detail_run_no, setting_machine, joint_ipo, split_seam, dimension_ng, foam_detached, joint_mark, thick_ng, film_blemish, other_ng)
                VALUES 
                (@Job, @DetailRunNo, @SettingMachine, @JointIpo, @SplitSeam, @DimensionNg, @FoamDetached, @JointMark, @ThickNg, @FilmBlemish, @OtherNg)";

            foreach (var def in request.Defects)
            {
                def.Job = job;
                await connection.ExecuteAsync(sqlInsertDefect, def, transaction);
            }
        }

        // 4. Tube1
        if (request.Tube1List != null && request.Tube1List.Any())
        {
            string sqlInsertTube1 = @"
                INSERT INTO T_PER2_IPO_Tube1 
                (job, detail_run_no, inside_dia_1, inside_dia_2, inside_dia_avg, thickness_1, thickness_2, thickness_3, thickness_4, thickness_avg, judgement, created_at)
                VALUES 
                (@Job, @DetailRunNo, @InsideDia1, @InsideDia2, @InsideDiaAvg, @Thickness1, @Thickness2, @Thickness3, @Thickness4, @ThicknessAvg, @Judgement, @CreatedAt)";

            foreach (var t1 in request.Tube1List)
            {
                t1.Job = job;
                if (t1.CreatedAt == default) t1.CreatedAt = now;
                await connection.ExecuteAsync(sqlInsertTube1, t1, transaction);
            }
        }

        // 5. Tube2
        if (request.Tube2List != null && request.Tube2List.Any())
        {
            string sqlInsertTube2 = @"
                INSERT INTO T_PER2_IPO_Tube2 
                (job, detail_run_no, inside_dia_1, inside_dia_2, inside_dia_avg, thickness_1, thickness_2, thickness_3, thickness_4, thickness_avg, judgement, created_at)
                VALUES 
                (@Job, @DetailRunNo, @InsideDia1, @InsideDia2, @InsideDiaAvg, @Thickness1, @Thickness2, @Thickness3, @Thickness4, @ThicknessAvg, @Judgement, @CreatedAt)";

            foreach (var t2 in request.Tube2List)
            {
                t2.Job = job;
                if (t2.CreatedAt == default) t2.CreatedAt = now;
                await connection.ExecuteAsync(sqlInsertTube2, t2, transaction);
            }
        }
    }
}
