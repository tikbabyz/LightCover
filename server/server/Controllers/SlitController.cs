using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using server.Models;
using server.Request;
using server.Responses;

namespace server.Controllers;

/// <summary>
/// Slit Controller: จัดการข้อมูลกระบวนการตัดสลิต (Slitting Process)
/// 1. ค้นหาข้อมูล Job และ BOM จากระบบ LiveApp (SyteLine)
/// 2. บันทึก / อัปเดต / ลบ ข้อมูลการผลิต (T_PER2_Slit_Head และ T_PER2_Slit_Detail) ใน IIT_DB
/// 3. รายงานสรุปสถิติและประวัติการผลิต Slit
/// </summary>
[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class SlitController : ControllerBase
{
    private readonly string LiveApp_connectionString;
    private readonly string IIT_connectionString;

    public SlitController(IConfiguration configuration)
    {
        LiveApp_connectionString = configuration.GetConnectionString("LiveApp_ConnectionString")!;
        IIT_connectionString = configuration.GetConnectionString("IIT_ConnectionString")!;
    }

    // =========================================================================
    // 1. SYTELINE / LIVEAPP QUERY (ค้นหา Job และ BOM วัตถุดิบ)
    // =========================================================================

    /// <summary>
    /// GET: api/slit/job/{jobNumber}
    /// ค้นหาข้อมูล Job จากระบบ SyteLine (LiveApp)
    /// </summary>
    [HttpGet("job/{jobNumber}")]
    public async Task<List<JobResponse>> GetJobTask(string jobNumber)
    {
        await using var connection = new SqlConnection(LiveApp_connectionString);

        const string jobSql = @"
            SELECT jm.job AS Job, job_date AS JobDate, im.item AS Item, im.description AS Description,
                   tc.Uf_Color AS ColorCode, im.Uf_PVC_Color AS PvcColor, RTRIM(LTRIM(tc.Uf_Color_Name)) AS ColorName,
                   im.Uf_Thick AS Thickness, im.Uf_Wide AS Width, im.Uf_Long AS Length,
                   jm.qty_released AS QtyReleased, im.Uf_Material_Type_New AS MaterialType,
                   CASE WHEN im.item NOT LIKE 'P%' THEN ISNULL(im.item, jm.item) ELSE '' END AS FinishedItem,
                   CASE WHEN im.item NOT LIKE 'P%' THEN ISNULL(im.item, jm.item) ELSE '' END AS ItemMst
            FROM job_mst AS jm
            LEFT JOIN item_mst AS im ON jm.item = im.item
            LEFT JOIN T_Color AS tc ON im.Uf_Color = tc.Uf_Color
            WHERE jm.job = @JobNumber OR im.item = @JobNumber OR jm.item = @JobNumber";

        var jobs = await connection.QueryAsync<JobResponse>(jobSql, new { JobNumber = jobNumber });
        return jobs.ToList();
    }

    /// <summary>
    /// GET: api/slit/bom/{item}
    /// ค้นหาข้อมูล BOM จากสูตรการผลิตวัตถุดิบ
    /// </summary>
    [HttpGet("bom/{item}")]
    public async Task<List<BomResponse>> GetItemBomTask(string item)
    {
        await using var connection = new SqlConnection(LiveApp_connectionString);

        var searchItem = (item ?? string.Empty).Trim();
        if (searchItem.Contains('-'))
        {
            searchItem = searchItem.Split('-')[0].Trim();
        }

        const string bomSql = @"
            SELECT i.item AS Item, jr.oper_num AS OperateNumber, jm.item AS MaterialItem,
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
            ORDER BY jm.sequence, jr.oper_num";

        var boms = (await connection.QueryAsync<BomResponse>(bomSql, new { Item = searchItem })).ToList();

        // Fallback 1: ตัด dash ท้าย หรือค้นหาด้วย item เต็ม
        if (boms.Count == 0 && searchItem != item?.Trim() && !string.IsNullOrWhiteSpace(item))
        {
            var lastDashIndex = item.LastIndexOf('-');
            if (lastDashIndex > 0)
            {
                var suffixTrimmed = item.Substring(0, lastDashIndex).Trim();
                if (suffixTrimmed != searchItem)
                {
                    boms = (await connection.QueryAsync<BomResponse>(bomSql, new { Item = suffixTrimmed })).ToList();
                    if (boms.Count > 0) return boms;
                }
            }

            boms = (await connection.QueryAsync<BomResponse>(bomSql, new { Item = item.Trim() })).ToList();
        }

        // Fallback 2: ค้นหาจาก jobmatl_mst โดยตรง
        if (boms.Count == 0 && !string.IsNullOrWhiteSpace(item))
        {
            const string jobMatlSql = @"
                SELECT TOP 10
                    jm.job AS Item, jmat.oper_num AS OperateNumber, rm.item AS MaterialItem,
                    RTRIM(LTRIM(tc.Uf_Color_Name)) AS MaterialColor, rm.Uf_PVC_Color AS MaterialPVCColor,
                    rm.Uf_Thick AS Thickness, rm.Uf_Wide AS Width, rm.Uf_Long AS Length,
                    jmat.matl_qty AS MatlQty, jmat.sequence AS Sequence, rm.description AS MaterialDescription, '' AS wc
                FROM job_mst AS jm
                INNER JOIN jobmatl_mst AS jmat ON jm.job = jmat.job AND jm.suffix = jmat.suffix
                INNER JOIN item_mst AS rm ON jmat.item = rm.item
                LEFT JOIN T_Color AS tc ON rm.Uf_Color = tc.Uf_Color
                WHERE (jm.job = @Item OR jm.item = @Item)
                  AND (rm.Uf_Wide >= 100 OR rm.item LIKE 'P%')
                ORDER BY rm.Uf_Wide DESC, jmat.sequence";

            boms = (await connection.QueryAsync<BomResponse>(jobMatlSql, new { Item = item.Trim() })).ToList();
        }

        return boms;
    }

    // =========================================================================
    // 2. SLIT HISTORY & REPORT QUERIES (ดึงประวัติ และ รายงานการผลิต)
    // =========================================================================

    /// <summary>
    /// GET: api/slit
    /// ดึงรายการส่วนหัว Head ทั้งหมด หรือกรองตามเงื่อนไข
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? job, 
        [FromQuery] string? partNo, 
        [FromQuery] string? keyword,
        [FromQuery] DateTime? startDate, 
        [FromQuery] DateTime? endDate)
    {
        await using var connection = new SqlConnection(IIT_connectionString);

        const string sql = @"
            SELECT id, job, part_no AS PartNo, material_no AS MaterialNo, description, 
                   std_thick AS StdThick, std_width AS StdWidth, std_length AS StdLength, 
                   product_date AS ProductDate, lot_number AS LotNumber, employee_name AS EmployeeName
            FROM T_PER2_Slit_Head
            WHERE (@Job IS NULL OR job LIKE '%' + @Job + '%')
              AND (@PartNo IS NULL OR part_no LIKE '%' + @PartNo + '%')
              AND (@StartDate IS NULL OR product_date >= @StartDate)
              AND (@EndDate IS NULL OR product_date <= @EndDate)
              AND (@Keyword IS NULL OR (
                    job LIKE '%' + @Keyword + '%' OR
                    part_no LIKE '%' + @Keyword + '%' OR
                    description LIKE '%' + @Keyword + '%' OR
                    employee_name LIKE '%' + @Keyword + '%' OR
                    lot_number LIKE '%' + @Keyword + '%'
              ))
            ORDER BY product_date DESC, id DESC";

        var result = await connection.QueryAsync<SlitHead>(sql, new { 
            Job = job, 
            PartNo = partNo, 
            StartDate = startDate, 
            EndDate = endDate,
            Keyword = keyword
        });

        return Ok(result);
    }

    /// <summary>
    /// GET: api/slit/full
    /// ดึงรายการครบทั้ง Head + Details พร้อม Enrich ข้อมูลจาก SyteLine (LiveApp)
    /// </summary>
    [HttpGet("full")]
    public async Task<IActionResult> GetFullJobs(
        [FromQuery] string? job,
        [FromQuery] string? partNo,
        [FromQuery] string? keyword,
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        await using var connection = new SqlConnection(IIT_connectionString);

        const string sqlHead = @"
            SELECT id, job, part_no AS PartNo, material_no AS MaterialNo, description, 
                   std_thick AS StdThick, std_width AS StdWidth, std_length AS StdLength, 
                   product_date AS ProductDate, lot_number AS LotNumber, employee_name AS EmployeeName
            FROM T_PER2_Slit_Head
            WHERE (@Job IS NULL OR job LIKE '%' + @Job + '%')
              AND (@PartNo IS NULL OR part_no LIKE '%' + @PartNo + '%')
              AND (@StartDate IS NULL OR product_date >= @StartDate)
              AND (@EndDate IS NULL OR product_date <= @EndDate)
              AND (@Keyword IS NULL OR (
                    job LIKE '%' + @Keyword + '%' OR
                    part_no LIKE '%' + @Keyword + '%' OR
                    description LIKE '%' + @Keyword + '%' OR
                    employee_name LIKE '%' + @Keyword + '%' OR
                    lot_number LIKE '%' + @Keyword + '%'
              ))
            ORDER BY product_date DESC, id DESC";

        var heads = (await connection.QueryAsync<SlitHead>(sqlHead, new { 
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

        var jobNumbers = heads.Select(h => h.Job).Distinct().ToList();

        const string sqlDetail = @"
            SELECT id, job, actualfoam_width AS ActualFoamWidth, emboss_lot AS EmbossLot,
                   emboss_roll AS EmbossRoll, emboss_total_roll AS EmbossTotalRoll,
                   firstshot_thick AS FirstShotThick, firstshot_width AS FirstShotWidth,
                   roll_used AS RollUsed, producted_qty AS ProductedQty,
                   remain_thick AS RemainThick, remain_length AS RemainLength, remain_width AS RemainWidth,
                   ng, loss_overstd AS LossOverStd, loss_product AS LossProduct,
                   actualused_qty AS ActualUsedQty, yield AS Yield
            FROM T_PER2_Slit_Detail
            WHERE job IN @Jobs";

        var details = (await connection.QueryAsync<SlitDetail>(sqlDetail, new { Jobs = jobNumbers })).ToList();
        var detailsByJob = details.GroupBy(d => d.Job ?? string.Empty).ToDictionary(g => g.Key, g => g.ToList());

        // Enrich ข้อมูลจาก LiveApp
        var enriched = await EnrichJobsWithLiveAppAsync(heads, detailsByJob);
        return Ok(enriched);
    }

    /// <summary>
    /// GET: api/slit/summary-report
    /// รายงานสรุปสถิติภาพรวมการผลิต Slit
    /// </summary>
    [HttpGet("summary-report")]
    public async Task<IActionResult> GetSummaryReport([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
    {
        await using var connection = new SqlConnection(IIT_connectionString);

        const string sql = @"
            SELECT 
                COUNT(DISTINCT h.job) AS TotalJobs,
                ISNULL(SUM(d.producted_qty), 0) AS TotalProductedQty,
                ISNULL(AVG(d.yield), 0) AS AvgYield,
                ISNULL(SUM(d.ng), 0) AS TotalNgMeters,
                ISNULL(SUM(d.loss_overstd), 0) AS TotalLossOverStd,
                ISNULL(SUM(d.loss_product), 0) AS TotalLossProduct,
                ISNULL(SUM(d.actualused_qty), 0) AS TotalActualUsed
            FROM T_PER2_Slit_Head h
            LEFT JOIN T_PER2_Slit_Detail d ON h.job = d.job
            WHERE (@StartDate IS NULL OR h.product_date >= @StartDate)
              AND (@EndDate IS NULL OR h.product_date <= @EndDate)";

        var summary = await connection.QueryFirstOrDefaultAsync(sql, new { StartDate = startDate, EndDate = endDate });

        const string sqlPartSummary = @"
            SELECT 
                h.part_no AS PartNo,
                h.description AS Description,
                COUNT(DISTINCT h.job) AS JobCount,
                ISNULL(SUM(d.producted_qty), 0) AS TotalQty,
                ISNULL(AVG(d.yield), 0) AS AvgYield
            FROM T_PER2_Slit_Head h
            LEFT JOIN T_PER2_Slit_Detail d ON h.job = d.job
            WHERE (@StartDate IS NULL OR h.product_date >= @StartDate)
              AND (@EndDate IS NULL OR h.product_date <= @EndDate)
            GROUP BY h.part_no, h.description
            ORDER BY TotalQty DESC";

        var partSummary = await connection.QueryAsync(sqlPartSummary, new { StartDate = startDate, EndDate = endDate });

        return Ok(new { summary, byPart = partSummary });
    }

    /// <summary>
    /// GET: api/slit/by-job?job=JOB-001
    /// ดึงข้อมูล Head และ Details ของ Job เจาะจง
    /// </summary>
    [HttpGet("by-job")]
    public async Task<IActionResult> GetByJob([FromQuery] string job)
    {
        if (string.IsNullOrWhiteSpace(job))
        {
            return BadRequest(new { message = "กรุณาระบุ Parameter job" });
        }

        await using var connection = new SqlConnection(IIT_connectionString);

        const string sqlHead = @"
            SELECT id, job, part_no AS PartNo, description, 
                   std_thick AS StdThick, std_width AS StdWidth, std_length AS StdLength, 
                   product_date AS ProductDate, lot_number AS LotNumber, employee_name AS EmployeeName
            FROM T_PER2_Slit_Head
            WHERE job = @Job";

        const string sqlDetail = @"
            SELECT id, job, actualfoam_width AS ActualFoamWidth, emboss_lot AS EmbossLot,
                   emboss_roll AS EmbossRoll, emboss_total_roll AS EmbossTotalRoll,
                   firstshot_thick AS FirstShotThick, firstshot_width AS FirstShotWidth,
                   roll_used AS RollUsed, producted_qty AS ProductedQty,
                   remain_thick AS RemainThick, remain_length AS RemainLength, remain_width AS RemainWidth,
                   ng, loss_overstd AS LossOverStd, loss_product AS LossProduct,
                   actualused_qty AS ActualUsedQty, yield AS Yield
            FROM T_PER2_Slit_Detail
            WHERE job = @Job";

        var head = await connection.QueryFirstOrDefaultAsync<SlitHead>(sqlHead, new { Job = job });
        if (head == null)
        {
            return NotFound(new { message = $"ไม่พบข้อมูล Job: {job}" });
        }

        var details = (await connection.QueryAsync<SlitDetail>(sqlDetail, new { Job = job })).ToList();
        head.LotNumber = NormalizeToYyyyMmDd(head.LotNumber);
        foreach (var d in details)
        {
            d.EmbossLot = NormalizeToYyyyMmDd(d.EmbossLot);
        }

        string colorName = string.Empty;
        string materialType = string.Empty;

        try
        {
            await using var liveConnection = new SqlConnection(LiveApp_connectionString);
            const string liveSql = @"
                SELECT TOP 1 
                       ISNULL(RTRIM(LTRIM(tc.Uf_Color_Name)), '') AS ColorName, 
                       ISNULL(im.Uf_Material_Type_New, '') AS MaterialType
                FROM job_mst AS jm
                LEFT JOIN item_mst AS im ON jm.item = im.item
                LEFT JOIN T_Color AS tc ON im.Uf_Color = tc.Uf_Color
                WHERE jm.job = @Job";

            var liveJob = await liveConnection.QueryFirstOrDefaultAsync(liveSql, new { Job = job });
            if (liveJob != null)
            {
                colorName = liveJob.ColorName?.ToString()?.Trim() ?? string.Empty;
                materialType = liveJob.MaterialType?.ToString()?.Trim() ?? string.Empty;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SlitController] LiveApp query notice in GetByJob: {ex.Message}");
        }

        return Ok(new
        {
            head,
            details,
            materialType,
            foamName = materialType,
            colorName,
            color = colorName
        });
    }

    /// <summary>
    /// GET: api/slit/check-emboss-lot?lot=...&excludeJob=...&excludeId=...
    /// ตรวจสอบว่า Lot Emboss นี้เคยถูกบันทึกในระบบแล้วหรือไม่ (ป้องกันการบันทึกซ้ำ)
    /// </summary>
    [HttpGet("check-emboss-lot")]
    public async Task<IActionResult> CheckEmbossLot(
        [FromQuery] string? lot, 
        [FromQuery] string? excludeJob, 
        [FromQuery] int? excludeId)
    {
        if (string.IsNullOrWhiteSpace(lot) || lot.Trim() == "-")
        {
            return Ok(new { isDuplicate = false });
        }

        await using var connection = new SqlConnection(IIT_connectionString);
        var norm = NormalizeToYyyyMmDd(lot);
        if (string.IsNullOrWhiteSpace(norm) || norm == "-")
        {
            return Ok(new { isDuplicate = false });
        }
        var normAlt = norm.Contains("Roll") ? norm.Replace("Roll", "ม้วน") : norm.Replace("ม้วน", "Roll");

        var cleanJob = !string.IsNullOrWhiteSpace(excludeJob) ? excludeJob.Trim().Split(',')[0].Trim() : null;
        if (cleanJob != null && cleanJob.Contains('#')) cleanJob = cleanJob.Split('#')[0].Trim();

        const string sql = @"
            SELECT TOP 1 d.job 
            FROM T_PER2_Slit_Detail d
            LEFT JOIN T_PER2_Slit_Head h ON d.job = h.job
            WHERE (d.emboss_lot = @Norm OR d.emboss_lot = @NormAlt OR d.emboss_lot = @Raw)
              AND (@ExcludeJob IS NULL OR (d.job != @ExcludeJob AND d.job NOT LIKE @ExcludeJob + '#%' AND d.job NOT LIKE '%' + @ExcludeJob + '%'))
              AND (@ExcludeId IS NULL OR h.id IS NULL OR h.id != @ExcludeId)";

        var foundJob = await connection.QueryFirstOrDefaultAsync<string>(sql, new {
            Norm = norm,
            NormAlt = normAlt,
            Raw = lot.Trim(),
            ExcludeJob = cleanJob,
            ExcludeId = (excludeId.HasValue && excludeId.Value > 0) ? excludeId.Value : (object)DBNull.Value
        });

        if (!string.IsNullOrEmpty(foundJob))
        {
            return Ok(new { 
                isDuplicate = true, 
                existingJob = foundJob,
                message = $"Lot Emboss '{lot.Trim()}' ถูกบันทึกไปแล้วใน Job {foundJob}"
            });
        }

        return Ok(new { isDuplicate = false });
    }

    // =========================================================================
    // 3. MUTATION OPERATIONS (SAVE, UPDATE, DELETE)
    // =========================================================================

    /// <summary>
    /// POST: api/slit/save หรือ api/slit
    /// บันทึกสร้าง Job ใหม่ หรือ อัปเดตหากระบุเป็นโหมดแก้ไข (IsEdit หรือมี ID)
    /// </summary>
    [HttpPost("save")]
    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SlitSaveRequest request)
    {
        if (request == null || request.Head == null)
        {
            return BadRequest(new { message = "ข้อมูลไม่ถูกต้อง: ไม่พบข้อมูลส่วนหัว (Head)" });
        }

        NormalizeSaveRequest(request);

        await using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            // ตรวจสอบว่า Lot Emboss ซ้ำหรือไม่ (ห้ามซ้ำ)
            if (request.Details != null && request.Details.Any())
            {
                foreach (var d in request.Details)
                {
                    var dupJob = await FindExistingEmbossLotJobAsync(connection, transaction, d.EmbossLot, request.Head.Job, request.Head.Id);
                    if (!string.IsNullOrEmpty(dupJob))
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(409, new { 
                            message = $"Lot Emboss '{d.EmbossLot}' ถูกบันทึกในระบบไปแล้ว (ซ้ำกับ Job {dupJob}) ห้ามบันทึกซ้ำ",
                            existingJob = dupJob
                        });
                    }
                }
            }
            // ตรวจสอบว่าเป็นโหมดอัปเดต หรือมี ID ระบุมา
            if (request.IsEdit || (request.Head.Id.HasValue && request.Head.Id.Value > 0))
            {
                var existing = await FindExistingHeadAsync(connection, transaction, request.Head.Id, request.Head.Job, request.OriginalJob);
                if (existing != null)
                {
                    await ExecuteUpdateInternalAsync(connection, transaction, request, existing.Id!.Value, existing.Job);
                    await transaction.CommitAsync();
                    return Ok(new { message = "อัปเดตข้อมูลเรียบร้อย", job = request.Head.Job, id = existing.Id });
                }
            }

            // จัดการกรณี Manual Job (ไม่มี Job Number หรือระบุเป็น -)
            if (IsManualJob(request.Head.Job))
            {
                request.Head.Job = await GenerateManualJobNoAsync(connection, transaction);
            }

            // จัดการ Unique Suffix (#2, #3) หากหมายเลข Job ซ้ำ
            request.Head.Job = await ResolveUniqueJobNoAsync(connection, transaction, request.Head.Job);

            // บันทึกรายการใหม่
            var newId = await ExecuteInsertInternalAsync(connection, transaction, request);
            await transaction.CommitAsync();

            return Ok(new { message = "บันทึกข้อมูลเรียบร้อย", job = request.Head.Job, id = newId });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "เกิดข้อผิดพลาดในการบันทึก", error = ex.Message });
        }
    }

    /// <summary>
    /// POST: api/slit/save-batch
    /// บันทึกหลาย Job พร้อมกันใน Transaction เดียว
    /// </summary>
    [HttpPost("save-batch")]
    public async Task<IActionResult> SaveBatch([FromBody] List<SlitSaveRequest> requests)
    {
        if (requests == null || !requests.Any())
        {
            return BadRequest(new { message = "ข้อมูลไม่ถูกต้อง: ไม่พบรายการ Job ที่ต้องการบันทึก" });
        }

        await using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        var savedJobs = new List<string>();

        try
        {
            foreach (var req in requests)
            {
                if (req == null || req.Head == null) continue;

                NormalizeSaveRequest(req);

                // ตรวจสอบว่า Lot Emboss ซ้ำหรือไม่ (ห้ามซ้ำ)
                if (req.Details != null && req.Details.Any())
                {
                    foreach (var d in req.Details)
                    {
                        var dupJob = await FindExistingEmbossLotJobAsync(connection, transaction, d.EmbossLot, req.Head.Job, req.Head.Id);
                        if (!string.IsNullOrEmpty(dupJob))
                        {
                            await transaction.RollbackAsync();
                            return StatusCode(409, new { 
                                message = $"Lot Emboss '{d.EmbossLot}' ถูกบันทึกในระบบไปแล้ว (ซ้ำกับ Job {dupJob}) ห้ามบันทึกซ้ำ",
                                existingJob = dupJob
                            });
                        }
                    }
                }

                if (IsManualJob(req.Head.Job))
                {
                    req.Head.Job = await GenerateManualJobNoAsync(connection, transaction);
                }

                req.Head.Job = await ResolveUniqueJobNoAsync(connection, transaction, req.Head.Job);
                await ExecuteInsertInternalAsync(connection, transaction, req);
                savedJobs.Add(req.Head.Job);
            }

            await transaction.CommitAsync();
            return Ok(new { message = $"บันทึกข้อมูลสำเร็จ {savedJobs.Count} รายการ", jobs = savedJobs });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "เกิดข้อผิดพลาดในการบันทึกชุดข้อมูล", error = ex.Message });
        }
    }

    /// <summary>
    /// PUT: api/slit/update หรือ api/slit
    /// อัปเดตแก้ไขข้อมูล Job เดิม
    /// </summary>
    [HttpPut("update")]
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] SlitSaveRequest request)
    {
        if (request == null || request.Head == null)
        {
            return BadRequest(new { message = "ข้อมูลไม่ถูกต้อง: ไม่พบข้อมูลส่วนหัว (Head)" });
        }

        NormalizeSaveRequest(request);

        await using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var existingHead = await FindExistingHeadAsync(connection, transaction, request.Head.Id, request.Head.Job, request.OriginalJob);
            if (existingHead == null)
            {
                await transaction.RollbackAsync();
                return NotFound(new { message = $"ไม่พบข้อมูล Job {request.OriginalJob ?? request.Head.Job} ในระบบสำหรับอัปเดต" });
            }

            // จัดการเลขที่ Job ป้องกัน UNIQUE constraint ใน T_PER2_Slit_Head:
            string reqJob = (request.Head.Job ?? string.Empty).Trim();
            string cleanReq = reqJob.Contains('#') ? reqJob.Split('#')[0].Trim() : reqJob;
            string cleanExisting = existingHead.Job.Contains('#') ? existingHead.Job.Split('#')[0].Trim() : existingHead.Job.Trim();

            if (string.Equals(cleanReq, cleanExisting, StringComparison.OrdinalIgnoreCase))
            {
                // ถ้า Base Job เหมือนเดิม (เช่น งานเดิมแค่แก้ไขขนาด, Qty หรือ Lot) ให้คง Job Key เดิมใน DB ไว้
                // เพื่อรักษา Suffix #2, #3 และไม่ให้ชน UNIQUE KEY constraint 'UQ__T_PER2_S__...'
                request.Head.Job = existingHead.Job;
            }
            else
            {
                // ถ้าผู้ใช้เปลี่ยนไปเป็น Job อื่น ให้ตรวจว่าชนกับ Record อื่นในระบบหรือไม่
                int dupJobCount = await connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(1) FROM T_PER2_Slit_Head WHERE job = @Candidate AND id != @Id",
                    new { Candidate = reqJob, Id = existingHead.Id!.Value },
                    transaction);

                if (dupJobCount > 0)
                {
                    // ถ้าซ้ำ ให้ resolve เป็น unique job name (เช่น ต่อท้ายด้วย #2, #3)
                    int suffix = 2;
                    string candidate = $"{cleanReq}#{suffix}";
                    while (await connection.ExecuteScalarAsync<int>(
                        "SELECT COUNT(1) FROM T_PER2_Slit_Head WHERE job = @Candidate AND id != @Id",
                        new { Candidate = candidate, Id = existingHead.Id!.Value },
                        transaction) > 0)
                    {
                        suffix++;
                        candidate = $"{cleanReq}#{suffix}";
                    }
                    request.Head.Job = candidate;
                }
            }

            // ตรวจสอบว่า Lot Emboss ซ้ำกับ Job อื่นหรือไม่
            if (request.Details != null && request.Details.Any())
            {
                foreach (var d in request.Details)
                {
                    var dupJob = await FindExistingEmbossLotJobAsync(connection, transaction, d.EmbossLot, existingHead.Job, existingHead.Id);
                    if (!string.IsNullOrEmpty(dupJob))
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(409, new { 
                            message = $"Lot Emboss '{d.EmbossLot}' ถูกบันทึกในระบบไปแล้ว (ซ้ำกับ Job {dupJob}) ห้ามบันทึกซ้ำ",
                            existingJob = dupJob
                        });
                    }
                }
            }

            await ExecuteUpdateInternalAsync(connection, transaction, request, existingHead.Id!.Value, existingHead.Job);
            await transaction.CommitAsync();

            return Ok(new { message = "อัปเดตข้อมูลเรียบร้อย", job = request.Head.Job, id = existingHead.Id });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "เกิดข้อผิดพลาดในการอัปเดต", error = ex.Message });
        }
    }

    /// <summary>
    /// DELETE: api/slit?job=JOB-001 หรือ api/slit?id=123 หรือ DELETE api/slit/{routeId}
    /// ลบข้อมูล Job และ Details ที่เกี่ยวข้องทั้งหมด
    /// </summary>
    [HttpDelete]
    [HttpDelete("{routeId:int}")]
    public async Task<IActionResult> Delete(
        [FromQuery] string? job, 
        [FromQuery] int? id, 
        [FromRoute] int? routeId)
    {
        var targetId = id ?? routeId;
        var targetJob = (job ?? string.Empty).Trim();

        if ((!targetId.HasValue || targetId.Value <= 0) && string.IsNullOrWhiteSpace(targetJob))
        {
            return BadRequest(new { message = "กรุณาระบุหมายเลข Job หรือ Id ที่ต้องการลบ" });
        }

        await using var connection = new SqlConnection(IIT_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            // 1. ค้นหา Head records ที่ตรงกันทั้งหมด
            var targetHeads = new List<SlitHead>();

            if (targetId.HasValue && targetId.Value > 0)
            {
                var h = await connection.QueryFirstOrDefaultAsync<SlitHead>(
                    "SELECT id, job FROM T_PER2_Slit_Head WHERE id = @Id",
                    new { Id = targetId.Value },
                    transaction);
                if (h != null) targetHeads.Add(h);
            }

            if (!targetHeads.Any() && !string.IsNullOrWhiteSpace(targetJob))
            {
                // หาก targetJob ส่งมาเป็นตัวเลข ID ให้ลองค้นหาด้วย ID ก่อน
                if (int.TryParse(targetJob, out var numId) && numId > 0)
                {
                    var h = await connection.QueryFirstOrDefaultAsync<SlitHead>(
                        "SELECT id, job FROM T_PER2_Slit_Head WHERE id = @Id",
                        new { Id = numId },
                        transaction);
                    if (h != null) targetHeads.Add(h);
                }

                // ค้นหาด้วย Job String (ครอบคลุมทั้งแบบตรงตัว, มี suffix #, หรือคั่นด้วย comma)
                if (!targetHeads.Any())
                {
                    var cleanJob = targetJob.Contains('#') ? targetJob.Split('#')[0].Trim() : targetJob;
                    const string sqlFind = @"
                        SELECT id, job FROM T_PER2_Slit_Head 
                        WHERE job = @Job 
                           OR job LIKE @CleanJob + '#%'
                           OR job LIKE @CleanJob + ',%'
                           OR job LIKE '%,' + @CleanJob + '%'
                           OR job = @CleanJob";

                    var found = await connection.QueryAsync<SlitHead>(sqlFind, new { Job = targetJob, CleanJob = cleanJob }, transaction);
                    targetHeads.AddRange(found);
                }
            }

            // รวบรวม Job names และ Head IDs ทั้งหมดที่ต้องลบ
            var jobNamesToDelete = targetHeads.Select(h => h.Job).Where(j => !string.IsNullOrEmpty(j)).Distinct().ToList();
            if (!string.IsNullOrEmpty(targetJob) && !jobNamesToDelete.Contains(targetJob))
            {
                jobNamesToDelete.Add(targetJob);
            }

            var headIdsToDelete = targetHeads.Select(h => h.Id!.Value).Distinct().ToList();
            if (targetId.HasValue && targetId.Value > 0 && !headIdsToDelete.Contains(targetId.Value))
            {
                headIdsToDelete.Add(targetId.Value);
            }

            // 2. ลบ Details ที่ตรงกับ Job names ทั้งหมด
            if (jobNamesToDelete.Any())
            {
                await connection.ExecuteAsync(
                    "DELETE FROM T_PER2_Slit_Detail WHERE job IN @Jobs",
                    new { Jobs = jobNamesToDelete },
                    transaction);
            }

            // 3. ลบ Head
            int affectedRows = 0;
            if (headIdsToDelete.Any())
            {
                affectedRows = await connection.ExecuteAsync(
                    "DELETE FROM T_PER2_Slit_Head WHERE id IN @Ids",
                    new { Ids = headIdsToDelete },
                    transaction);
            }
            else if (jobNamesToDelete.Any())
            {
                affectedRows = await connection.ExecuteAsync(
                    "DELETE FROM T_PER2_Slit_Head WHERE job IN @Jobs",
                    new { Jobs = jobNamesToDelete },
                    transaction);
            }

            await transaction.CommitAsync();

            return Ok(new
            {
                message = "ลบข้อมูลสำเร็จ",
                deletedJobs = jobNamesToDelete,
                deletedIds = headIdsToDelete,
                affectedRows
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "เกิดข้อผิดพลาดในการลบข้อมูล", error = ex.Message });
        }
    }

    // =========================================================================
    // 4. CLEAN CODE HELPERS & BUSINESS LOGIC
    // =========================================================================

    /// <summary>
    /// ปรับแต่งค่า Request ให้พร้อมสำหรับบันทึก/อัปเดต ป้องกัน Null และจัดรูปแบบวันที่ yyyy-MM-dd
    /// </summary>
    private static void NormalizeSaveRequest(SlitSaveRequest request)
    {
        request.Head.Job = string.IsNullOrWhiteSpace(request.Head.Job) ? "-" : request.Head.Job.Trim();
        request.Head.PartNo ??= string.Empty;
        request.Head.MaterialNo ??= string.Empty;
        request.Head.Description ??= string.Empty;
        request.Head.StdThick ??= 0;
        request.Head.StdWidth ??= 0;
        request.Head.StdLength ??= 0;
        request.Head.LotNumber = NormalizeToYyyyMmDd(request.Head.LotNumber);
        request.Head.EmployeeName ??= string.Empty;
        if (request.Head.ProductDate == null || request.Head.ProductDate == default)
        {
            request.Head.ProductDate = DateTime.Today;
        }

        if (request.Details == null) return;

        foreach (var item in request.Details)
        {
            item.EmbossLot = NormalizeToYyyyMmDd(item.EmbossLot);
            if (string.IsNullOrWhiteSpace(item.EmbossLot)) item.EmbossLot = "-";
            item.EmbossRoll = string.IsNullOrWhiteSpace(item.EmbossRoll) ? null : item.EmbossRoll.Trim();
            item.EmbossTotalRoll = string.IsNullOrWhiteSpace(item.EmbossTotalRoll) ? null : item.EmbossTotalRoll.Trim();
            item.ActualFoamWidth ??= 0;
            item.FirstShotThick ??= 0;
            item.FirstShotWidth ??= 0;
            item.RollUsed ??= 1;
            item.ProductedQty ??= 0;
            item.RemainThick ??= 0;
            item.RemainLength ??= 0;
            item.RemainWidth ??= 0;
            item.Ng ??= 0;
            item.LossOverStd ??= 0;
            item.LossProduct ??= 0;
            item.ActualUsedQty ??= 0;
            item.Yield ??= 0;
        }
    }

    /// <summary>
    /// ตรวจสอบว่า Lot Emboss นี้เคยถูกบันทึกในระบบแล้วหรือไม่
    /// </summary>
    private static async Task<string?> FindExistingEmbossLotJobAsync(
        SqlConnection connection, 
        SqlTransaction transaction, 
        string? embossLot, 
        string? currentJob, 
        int? currentHeadId)
    {
        if (string.IsNullOrWhiteSpace(embossLot) || embossLot.Trim() == "-") return null;

        var norm = NormalizeToYyyyMmDd(embossLot);
        if (string.IsNullOrWhiteSpace(norm) || norm == "-") return null;

        var normAlt = norm.Contains("Roll") ? norm.Replace("Roll", "ม้วน") : norm.Replace("ม้วน", "Roll");

        var cleanJob = !string.IsNullOrWhiteSpace(currentJob) ? currentJob.Trim().Split(',')[0].Trim() : null;
        if (cleanJob != null && cleanJob.Contains('#')) cleanJob = cleanJob.Split('#')[0].Trim();

        const string sql = @"
            SELECT TOP 1 d.job 
            FROM T_PER2_Slit_Detail d
            LEFT JOIN T_PER2_Slit_Head h ON d.job = h.job
            WHERE (d.emboss_lot = @Norm OR d.emboss_lot = @NormAlt OR d.emboss_lot = @Raw)
              AND (@CurrentJob IS NULL OR (d.job != @CurrentJob AND d.job NOT LIKE @CurrentJob + '#%' AND d.job NOT LIKE '%' + @CurrentJob + '%'))
              AND (@CurrentHeadId IS NULL OR h.id IS NULL OR h.id != @CurrentHeadId)";

        var foundJob = await connection.QueryFirstOrDefaultAsync<string>(sql, new {
            Norm = norm,
            NormAlt = normAlt,
            Raw = embossLot.Trim(),
            CurrentJob = cleanJob,
            CurrentHeadId = (currentHeadId.HasValue && currentHeadId.Value > 0) ? currentHeadId.Value : (object)DBNull.Value
        }, transaction);

        return foundJob;
    }

    private static bool IsManualJob(string? job)
    {
        if (string.IsNullOrWhiteSpace(job)) return true;
        var trimmed = job.Trim();
        return trimmed == "-" ||
               trimmed.StartsWith("NO-JOB", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("MANUAL", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// สร้างเลขที่ Job รายวันสำหรับ Manual Mode (M-yyMMdd-01, M-yyMMdd-02, ...)
    /// </summary>
    private static async Task<string> GenerateManualJobNoAsync(SqlConnection connection, SqlTransaction transaction)
    {
        string datePrefix = $"M-{DateTime.Now:yyMMdd}-";
        const string sqlSeq = "SELECT job FROM T_PER2_Slit_Head WHERE job LIKE @Prefix";
        var existingJobs = (await connection.QueryAsync<string>(sqlSeq, new { Prefix = $"{datePrefix}%" }, transaction)).ToList();

        int nextSeq = 1;
        if (existingJobs.Any())
        {
            var seqNumbers = existingJobs
                .Select(j => {
                    var clean = j.Contains('#') ? j.Split('#')[0] : j;
                    var parts = clean.Split('-');
                    return (parts.Length >= 3 && int.TryParse(parts[2], out int num)) ? num : 0;
                })
                .ToList();

            if (seqNumbers.Any())
            {
                nextSeq = seqNumbers.Max() + 1;
            }
        }

        string candidateJob = $"{datePrefix}{nextSeq:D2}";
        while (await connection.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM T_PER2_Slit_Head WHERE job = @Candidate", new { Candidate = candidateJob }, transaction) > 0)
        {
            nextSeq++;
            candidateJob = $"{datePrefix}{nextSeq:D2}";
        }

        return candidateJob;
    }

    /// <summary>
    /// แก้ปัญหาหมายเลข Job ซ้ำกรณีสลิตหลายม้วน โดยต่อท้ายด้วย #2, #3, ...
    /// </summary>
    private static async Task<string> ResolveUniqueJobNoAsync(SqlConnection connection, SqlTransaction transaction, string baseJob)
    {
        int exists = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM T_PER2_Slit_Head WHERE job = @Job", 
            new { Job = baseJob }, 
            transaction);

        if (exists == 0) return baseJob;

        string cleanBase = baseJob.Contains('#') ? baseJob.Split('#')[0] : baseJob;
        int rollIndex = 2;
        string candidate = $"{cleanBase}#{rollIndex}";

        while (await connection.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM T_PER2_Slit_Head WHERE job = @Candidate", new { Candidate = candidate }, transaction) > 0)
        {
            rollIndex++;
            candidate = $"{cleanBase}#{rollIndex}";
        }

        return candidate;
    }

    /// <summary>
    /// ค้นหา Record เดิมจาก Id, OriginalJob หรือ Job
    /// </summary>
    private static async Task<SlitHead?> FindExistingHeadAsync(
        SqlConnection connection, 
        SqlTransaction transaction, 
        int? id, 
        string? job, 
        string? originalJob)
    {
        // 1. ค้นหาด้วย Id
        if (id.HasValue && id.Value > 0)
        {
            var byId = await connection.QueryFirstOrDefaultAsync<SlitHead>(
                "SELECT id, job, part_no, lot_number FROM T_PER2_Slit_Head WHERE id = @Id",
                new { Id = id.Value },
                transaction);
            if (byId != null) return byId;
        }

        // 2. ค้นหาด้วย OriginalJob
        if (!string.IsNullOrWhiteSpace(originalJob))
        {
            var cleanOrig = originalJob.Contains('#') ? originalJob.Split('#')[0].Trim() : originalJob.Trim();
            var byOrig = await connection.QueryFirstOrDefaultAsync<SlitHead>(
                @"SELECT TOP 1 id, job, part_no, lot_number FROM T_PER2_Slit_Head 
                  WHERE job = @OriginalJob OR job = @CleanOrig OR job LIKE @CleanOrig + '#%'",
                new { OriginalJob = originalJob.Trim(), CleanOrig = cleanOrig },
                transaction);
            if (byOrig != null) return byOrig;
        }

        // 3. ค้นหาด้วย Job
        if (!string.IsNullOrWhiteSpace(job))
        {
            var cleanFirstJob = job.Split(',')[0].Trim();
            var cleanJobNoHash = cleanFirstJob.Contains('#') ? cleanFirstJob.Split('#')[0].Trim() : cleanFirstJob;

            var byJob = await connection.QueryFirstOrDefaultAsync<SlitHead>(
                @"SELECT TOP 1 id, job, part_no, lot_number FROM T_PER2_Slit_Head 
                  WHERE job = @Job 
                     OR job = @FirstJob 
                     OR job = @NoHash 
                     OR job LIKE @NoHash + '#%'
                     OR job LIKE @FirstJob + ',%'
                     OR job LIKE '%,' + @FirstJob + '%'
                     OR job LIKE '%,' + @FirstJob",
                new { Job = job.Trim(), FirstJob = cleanFirstJob, NoHash = cleanJobNoHash },
                transaction);
            if (byJob != null) return byJob;
        }

        return null;
    }

    /// <summary>
    /// Helper: ประมวลผล UPDATE Head + DELETE Details เดิม + INSERT Details ใหม่
    /// </summary>
    private static async Task ExecuteUpdateInternalAsync(
        SqlConnection connection, 
        SqlTransaction transaction, 
        SlitSaveRequest request, 
        int existingId, 
        string existingJob)
    {
        request.Head.Id = existingId;

        const string sqlUpdateHead = @"
            UPDATE T_PER2_Slit_Head
            SET job = @Job,
                part_no = @PartNo,
                material_no = @MaterialNo,
                description = @Description,
                std_thick = @StdThick,
                std_width = @StdWidth,
                std_length = @StdLength,
                product_date = @ProductDate,
                lot_number = @LotNumber,
                employee_name = @EmployeeName
            WHERE id = @Id";

        await connection.ExecuteAsync(sqlUpdateHead, new
        {
            Id = existingId,
            Job = request.Head.Job,
            PartNo = request.Head.PartNo,
            MaterialNo = request.Head.MaterialNo,
            Description = request.Head.Description,
            StdThick = request.Head.StdThick,
            StdWidth = request.Head.StdWidth,
            StdLength = request.Head.StdLength,
            ProductDate = request.Head.ProductDate,
            LotNumber = request.Head.LotNumber,
            EmployeeName = request.Head.EmployeeName
        }, transaction);

        // ลบ Detail เดิมออกเฉพาะของ Job Record นี้
        const string sqlDeleteDetails = @"
            DELETE FROM T_PER2_Slit_Detail 
            WHERE job = @OldJob OR job = @NewJob";

        await connection.ExecuteAsync(sqlDeleteDetails, new
        {
            OldJob = existingJob,
            NewJob = request.Head.Job
        }, transaction);

        // INSERT Details ใหม่
        if (request.Details != null && request.Details.Any())
        {
            const string sqlInsertDetail = @"
                INSERT INTO T_PER2_Slit_Detail
                (job, actualfoam_width, emboss_lot, emboss_roll, emboss_total_roll,
                 firstshot_thick, firstshot_width, roll_used, producted_qty,
                 remain_thick, remain_length, remain_width, ng, loss_overstd, loss_product, actualused_qty, yield)
                VALUES
                (@Job, @ActualFoamWidth, @EmbossLot, @EmbossRoll, @EmbossTotalRoll,
                 @FirstShotThick, @FirstShotWidth, @RollUsed, @ProductedQty,
                 @RemainThick, @RemainLength, @RemainWidth, @Ng, @LossOverStd, @LossProduct, @ActualUsedQty, @Yield)";

            foreach (var item in request.Details)
            {
                item.Job = request.Head.Job;
                await connection.ExecuteAsync(sqlInsertDetail, item, transaction);
            }
        }
    }

    /// <summary>
    /// Helper: ประมวลผล INSERT Head และ Details
    /// </summary>
    private static async Task<int> ExecuteInsertInternalAsync(
        SqlConnection connection, 
        SqlTransaction transaction, 
        SlitSaveRequest request)
    {
        const string sqlInsertHead = @"
            INSERT INTO T_PER2_Slit_Head 
            (job, part_no, material_no, description, std_thick, std_width, std_length, product_date, lot_number, employee_name)
            VALUES 
            (@Job, @PartNo, @MaterialNo, @Description, @StdThick, @StdWidth, @StdLength, @ProductDate, @LotNumber, @EmployeeName);
            SELECT CAST(SCOPE_IDENTITY() AS INT);";

        int newId = await connection.ExecuteScalarAsync<int>(sqlInsertHead, request.Head, transaction);
        request.Head.Id = newId;

        if (request.Details != null && request.Details.Any())
        {
            const string sqlInsertDetail = @"
                INSERT INTO T_PER2_Slit_Detail
                (job, actualfoam_width, emboss_lot, emboss_roll, emboss_total_roll,
                 firstshot_thick, firstshot_width, roll_used, producted_qty,
                 remain_thick, remain_length, remain_width, ng, loss_overstd, loss_product, actualused_qty, yield)
                VALUES
                (@Job, @ActualFoamWidth, @EmbossLot, @EmbossRoll, @EmbossTotalRoll,
                 @FirstShotThick, @FirstShotWidth, @RollUsed, @ProductedQty,
                 @RemainThick, @RemainLength, @RemainWidth, @Ng, @LossOverStd, @LossProduct, @ActualUsedQty, @Yield)";

            foreach (var item in request.Details)
            {
                item.Job = request.Head.Job;
                await connection.ExecuteAsync(sqlInsertDetail, item, transaction);
            }
        }

        return newId;
    }

    /// <summary>
    /// Helper: ดึงข้อมูลเสริมจาก LiveApp เพื่อสร้าง Full Jobs response
    /// </summary>
    private async Task<List<object>> EnrichJobsWithLiveAppAsync(
        List<SlitHead> heads, 
        Dictionary<string, List<SlitDetail>> detailsByJob)
    {
        var jobNumbers = heads.Select(h => h.Job).Distinct().ToList();
        var liveDataByJob = new Dictionary<string, (string ColorName, string MaterialType, string FinishedItem)>(StringComparer.OrdinalIgnoreCase);
        var liveMatByJob = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var liveDataByPart = new Dictionary<string, (string ColorName, string MaterialType, string ItemDescription)>(StringComparer.OrdinalIgnoreCase);
        var liveMatByPart = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            await using var liveConnection = new SqlConnection(LiveApp_connectionString);
            var cleanJobs = jobNumbers
                .Where(j => !string.IsNullOrEmpty(j))
                .Select(j => j.Contains('#') ? j.Split('#')[0] : j)
                .SelectMany(j => j.Split(','))
                .Select(j => j.Trim())
                .Where(j => !string.IsNullOrEmpty(j) 
                    && !j.StartsWith("MANUAL", StringComparison.OrdinalIgnoreCase) 
                    && !j.StartsWith("M-", StringComparison.OrdinalIgnoreCase) 
                    && !j.StartsWith("NO-JOB", StringComparison.OrdinalIgnoreCase))
                .Distinct()
                .ToList();

            if (cleanJobs.Any())
            {
                const string jobSql = @"
                    SELECT jm.job AS Job, 
                           im.item AS PartNo,
                           ISNULL(RTRIM(LTRIM(tc.Uf_Color_Name)), '') AS ColorName, 
                           ISNULL(im.Uf_Material_Type_New, '') AS MaterialType
                    FROM job_mst AS jm
                    LEFT JOIN item_mst AS im ON jm.item = im.item
                    LEFT JOIN T_Color AS tc ON im.Uf_Color = tc.Uf_Color
                    WHERE jm.job IN @Jobs";

                var liveJobs = await liveConnection.QueryAsync(jobSql, new { Jobs = cleanJobs });
                foreach (var lj in liveJobs)
                {
                    string j = lj.Job?.ToString()?.Trim() ?? string.Empty;
                    if (!string.IsNullOrEmpty(j) && !liveDataByJob.ContainsKey(j))
                    {
                        liveDataByJob[j] = (
                            lj.ColorName?.ToString()?.Trim() ?? string.Empty, 
                            lj.MaterialType?.ToString()?.Trim() ?? string.Empty,
                            lj.PartNo?.ToString()?.Trim() ?? string.Empty
                        );
                    }
                }

                const string matSql = @"
                    SELECT jmat.job AS Job, rm.item AS MaterialItem
                    FROM jobmatl_mst AS jmat
                    INNER JOIN item_mst AS rm ON jmat.item = rm.item
                    WHERE jmat.job IN @Jobs AND (rm.item LIKE 'P%' OR rm.Uf_Wide >= 100)
                    ORDER BY rm.Uf_Wide DESC, jmat.sequence";

                var liveMats = await liveConnection.QueryAsync(matSql, new { Jobs = cleanJobs });
                foreach (var lm in liveMats)
                {
                    string j = lm.Job?.ToString()?.Trim() ?? string.Empty;
                    string m = lm.MaterialItem?.ToString()?.Trim() ?? string.Empty;
                    if (!string.IsNullOrEmpty(j) && !string.IsNullOrEmpty(m) && !liveMatByJob.ContainsKey(j))
                    {
                        liveMatByJob[j] = m;
                    }
                }
            }

            var partNos = heads
                .Where(h => !string.IsNullOrEmpty(h.PartNo))
                .SelectMany(h => h.PartNo!.Split(','))
                .Select(p => p.Trim())
                .Where(p => !string.IsNullOrEmpty(p))
                .Distinct()
                .ToList();

            if (partNos.Any())
            {
                const string partSql = @"
                    SELECT im.item AS PartNo, 
                           ISNULL(RTRIM(LTRIM(tc.Uf_Color_Name)), '') AS ColorName, 
                           ISNULL(im.Uf_Material_Type_New, '') AS MaterialType,
                           ISNULL(im.description, '') AS ItemDescription
                    FROM item_mst AS im
                    LEFT JOIN T_Color AS tc ON im.Uf_Color = tc.Uf_Color
                    WHERE im.item IN @Parts";

                var liveParts = await liveConnection.QueryAsync(partSql, new { Parts = partNos });
                foreach (var lp in liveParts)
                {
                    string p = lp.PartNo?.ToString()?.Trim() ?? string.Empty;
                    if (!string.IsNullOrEmpty(p) && !liveDataByPart.ContainsKey(p))
                    {
                        liveDataByPart[p] = (
                            lp.ColorName?.ToString()?.Trim() ?? string.Empty,
                            lp.MaterialType?.ToString()?.Trim() ?? string.Empty,
                            lp.ItemDescription?.ToString()?.Trim() ?? string.Empty
                        );
                    }
                }

                const string partMatSql = @"
                    SELECT jm.item AS PartNo, rm.item AS MaterialItem
                    FROM job_mst AS jm
                    INNER JOIN jobmatl_mst AS jmat ON jm.job = jmat.job AND jm.suffix = jmat.suffix
                    INNER JOIN item_mst AS rm ON jmat.item = rm.item
                    WHERE jm.item IN @Parts AND (rm.item LIKE 'P%' OR rm.Uf_Wide >= 100)
                    ORDER BY rm.Uf_Wide DESC, jmat.sequence";

                var livePartMats = await liveConnection.QueryAsync(partMatSql, new { Parts = partNos });
                foreach (var lpm in livePartMats)
                {
                    string p = lpm.PartNo?.ToString()?.Trim() ?? string.Empty;
                    string m = lpm.MaterialItem?.ToString()?.Trim() ?? string.Empty;
                    if (!string.IsNullOrEmpty(p) && !string.IsNullOrEmpty(m) && !liveMatByPart.ContainsKey(p))
                    {
                        liveMatByPart[p] = m;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SlitController] LiveApp lookup notice: {ex.Message}");
        }

        var fullJobs = heads.Select((h, index) => {
            var jobDetails = detailsByJob.ContainsKey(h.Job) ? detailsByJob[h.Job] : new List<SlitDetail>();
            var firstDetail = jobDetails.FirstOrDefault();
            var secondDetail = jobDetails.ElementAtOrDefault(1);

            var cleanJobStr = h.Job ?? string.Empty;
            if (cleanJobStr.Contains('#')) cleanJobStr = cleanJobStr.Split('#')[0];
            var jobList = cleanJobStr.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var partList = (h.PartNo ?? string.Empty).Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

            var firstSheetEntries = jobDetails.Select((d, dIdx) => {
                var rawJ = dIdx < jobList.Length ? jobList[dIdx] : (jobList.Length > 0 ? jobList[0] : string.Empty);
                var cleanedJ = (rawJ.StartsWith("MANUAL", StringComparison.OrdinalIgnoreCase) || rawJ.StartsWith("M-", StringComparison.OrdinalIgnoreCase) || rawJ.StartsWith("NO-JOB", StringComparison.OrdinalIgnoreCase)) ? "-" : rawJ;
                return new {
                    jobNo = cleanedJ,
                    partNo = dIdx < partList.Length ? partList[dIdx] : (partList.Length > 0 ? partList[0] : string.Empty),
                    width = d.FirstShotWidth,
                    qty = d.ProductedQty,
                    embossLot = d.EmbossLot,
                    embossRoll = d.EmbossRoll,
                    embossTotalRoll = d.EmbossTotalRoll
                };
            }).ToList();

            var totalQty = jobDetails.Sum(d => d.ProductedQty);
            var yieldVal = firstDetail?.Yield ?? 0;
            var isYieldWarning = yieldVal < 95.0;

            string colorName = string.Empty;
            string materialType = string.Empty;
            string finishedItem = string.Empty;
            string rawJobItem = string.Empty;

            if (!string.IsNullOrEmpty(h.Job))
            {
                var cleanJ = h.Job.Contains('#') ? h.Job.Split('#')[0] : h.Job;
                var subJobs = cleanJ.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                foreach (var sj in subJobs)
                {
                    if (liveDataByJob.TryGetValue(sj, out var jInfo))
                    {
                        if (string.IsNullOrEmpty(colorName)) colorName = jInfo.ColorName;
                        if (string.IsNullOrEmpty(materialType)) materialType = jInfo.MaterialType;
                        if (string.IsNullOrEmpty(rawJobItem)) rawJobItem = jInfo.FinishedItem;
                        if (!string.IsNullOrEmpty(rawJobItem) && !rawJobItem.StartsWith("P", StringComparison.OrdinalIgnoreCase) && string.IsNullOrEmpty(finishedItem))
                        {
                            finishedItem = rawJobItem;
                        }
                    }
                }
            }

            if (string.IsNullOrEmpty(materialType) && !string.IsNullOrEmpty(h.PartNo) && liveDataByPart.TryGetValue(h.PartNo.Trim(), out var pInfo))
            {
                if (string.IsNullOrEmpty(colorName)) colorName = pInfo.ColorName;
                materialType = pInfo.MaterialType;
            }

            // Fallback Description
            if (string.IsNullOrEmpty(materialType) && !string.IsNullOrEmpty(h.Description))
            {
                var words = h.Description.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (words.Length > 0 && !words[0].Equals(h.PartNo, StringComparison.OrdinalIgnoreCase))
                {
                    materialType = words[0];
                }
            }

            if (string.IsNullOrEmpty(colorName) && !string.IsNullOrEmpty(h.Description))
            {
                var words = h.Description.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (words.Length > 1)
                {
                    var last = words[^1];
                    if (!last.Contains('X') && !last.Contains('x') && !last.Equals(h.PartNo, StringComparison.OrdinalIgnoreCase))
                    {
                        colorName = last;
                    }
                }
            }

            string resolvedPartNo = string.Empty;
            if (!string.IsNullOrEmpty(h.PartNo) && h.PartNo.Contains(','))
            {
                resolvedPartNo = h.PartNo;
            }
            else if (!string.IsNullOrEmpty(finishedItem) && !finishedItem.StartsWith("P", StringComparison.OrdinalIgnoreCase))
            {
                resolvedPartNo = finishedItem;
            }
            else if (!string.IsNullOrEmpty(h.PartNo) && !h.PartNo.StartsWith("P", StringComparison.OrdinalIgnoreCase))
            {
                resolvedPartNo = h.PartNo;
            }

            string resolvedMaterialNo = !string.IsNullOrWhiteSpace(h.MaterialNo) ? h.MaterialNo.Trim() : string.Empty;
            if (string.IsNullOrEmpty(resolvedMaterialNo) && !string.IsNullOrEmpty(h.Job))
            {
                var cleanJobForMat = h.Job.Contains('#') ? h.Job.Split('#')[0] : h.Job;
                var subJobs = cleanJobForMat.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                foreach (var sj in subJobs)
                {
                    if (liveMatByJob.TryGetValue(sj, out var mRoll) && !string.IsNullOrEmpty(mRoll))
                    {
                        resolvedMaterialNo = mRoll;
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(resolvedMaterialNo) && !string.IsNullOrEmpty(h.PartNo))
            {
                var subParts = h.PartNo.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                foreach (var sp in subParts)
                {
                    if (sp.StartsWith("P", StringComparison.OrdinalIgnoreCase))
                    {
                        resolvedMaterialNo = sp;
                        break;
                    }
                    if (liveMatByPart.TryGetValue(sp, out var mPart) && !string.IsNullOrEmpty(mPart))
                    {
                        resolvedMaterialNo = mPart;
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(resolvedMaterialNo) && !string.IsNullOrEmpty(rawJobItem) && rawJobItem.StartsWith("P", StringComparison.OrdinalIgnoreCase))
            {
                resolvedMaterialNo = rawJobItem;
            }

            string rawJob = h.Job ?? string.Empty;
            string displayJobNo = rawJob.Contains('#') ? rawJob.Split('#')[0] : rawJob;
            if (displayJobNo.StartsWith("MANUAL-", StringComparison.OrdinalIgnoreCase) || displayJobNo.StartsWith("NO-JOB", StringComparison.OrdinalIgnoreCase))
            {
                displayJobNo = "-";
            }

            string itemDesc = string.Empty;
            if (!string.IsNullOrEmpty(resolvedPartNo) && liveDataByPart.TryGetValue(resolvedPartNo.Trim(), out var pInfDesc) && !string.IsNullOrEmpty(pInfDesc.ItemDescription))
            {
                itemDesc = pInfDesc.ItemDescription;
            }

            return (object)new {
                id = h.Id,
                sequenceNo = index + 1,
                jobNo = displayJobNo,
                rawJobNo = h.Job,
                partNo = resolvedPartNo,
                itemMst = resolvedPartNo,
                finishedItem = resolvedPartNo,
                materialNo = resolvedMaterialNo,
                description = h.Description,
                itemDescription = !string.IsNullOrEmpty(itemDesc) ? itemDesc : h.Description,
                productName = !string.IsNullOrEmpty(itemDesc) ? itemDesc : h.Description,
                materialType = materialType,
                foamName = materialType,
                colorName = colorName,
                color = colorName,
                stdThick = h.StdThick ?? 0,
                stdWidth = h.StdWidth ?? 0,
                stdLength = h.StdLength ?? 0,
                date = (h.ProductDate ?? DateTime.Today).ToString("yyyy-MM-dd"),
                productionDate = (h.ProductDate ?? DateTime.Today).ToString("yyyy-MM-dd"),
                lotNumber = NormalizeToYyyyMmDd(h.LotNumber),
                lotNo = NormalizeToYyyyMmDd(h.LotNumber),
                operatorName = h.EmployeeName ?? string.Empty,
                actualFoamWidth = firstDetail?.ActualFoamWidth ?? 0,
                embossLot = NormalizeToYyyyMmDd(firstDetail?.EmbossLot),
                embossRoll = firstDetail?.EmbossRoll ?? string.Empty,
                embossTotalRoll = firstDetail?.EmbossTotalRoll ?? string.Empty,
                firstSheetThick = firstDetail?.FirstShotThick ?? h.StdThick ?? 0,
                firstSheetEntries = firstSheetEntries,
                firstSheetWidth = firstDetail?.FirstShotWidth ?? 0,
                firstSheetWidth1 = firstDetail?.FirstShotWidth ?? 0,
                productedQty = firstDetail?.ProductedQty ?? 0,
                productedQty1 = firstDetail?.ProductedQty ?? 0,
                firstSheetWidth2 = secondDetail?.FirstShotWidth ?? 0,
                productedQty2 = secondDetail?.ProductedQty ?? 0,
                totalProductedQty = totalQty,
                rollUsed = firstDetail?.RollUsed ?? 1,
                remainThick = firstDetail?.RemainThick ?? h.StdThick ?? 0,
                remainLength = firstDetail?.RemainLength ?? h.StdLength ?? 0,
                remainWidth = firstDetail?.RemainWidth ?? 0,
                ng = firstDetail?.Ng ?? 0,
                lossOverStd = firstDetail?.LossOverStd ?? 0,
                lossProduct = firstDetail?.LossProduct ?? 0,
                actualUsedQty = firstDetail?.ActualUsedQty ?? 0,
                yield = yieldVal,
                isYieldWarning = isYieldWarning,
                status = isYieldWarning ? "Warning" : "Completed",
                createdAt = (h.ProductDate ?? DateTime.Today).ToString("yyyy-MM-ddTHH:mm:ss")
            };
        }).ToList();

        return fullJobs;
    }

    /// <summary>
    /// แปลงรูปแบบวันที่เป็น yyyy-MM-dd โดยรักษารายละเอียดหมายเลขม้วน (Roll X/Y) ไว้อย่างถูกต้อง
    /// </summary>
    private static string NormalizeToYyyyMmDd(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var trimmed = input.Trim();
        if (trimmed.Contains('T')) trimmed = trimmed.Split('T')[0];

        // แยกข้อมูลในวงเล็บ เช่น "(ม้วน 8/8)" หรือ "(Roll 8/8)"
        string rollSuffix = string.Empty;
        var openBracketIdx = trimmed.IndexOf('(');
        var closeBracketIdx = trimmed.IndexOf(')');
        if (openBracketIdx >= 0 && closeBracketIdx > openBracketIdx)
        {
            var bracketContent = trimmed.Substring(openBracketIdx, closeBracketIdx - openBracketIdx + 1).Trim();
            bracketContent = bracketContent.Replace("ม้วน", "Roll");
            rollSuffix = " " + bracketContent;
            trimmed = trimmed.Substring(0, openBracketIdx).Trim();
        }

        var parts = trimmed.Split(new[] { '-', '/', '.' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 3)
        {
            if (int.TryParse(parts[0], out var p0) && int.TryParse(parts[1], out var p1) && int.TryParse(parts[2], out var p2))
            {
                if (p0 > 1000) // YYYY-MM-DD
                {
                    var y = p0 >= 2500 ? p0 - 543 : p0;
                    return $"{y:D4}-{p1:D2}-{p2:D2}{rollSuffix}".Trim();
                }
                else // DD-MM-YYYY
                {
                    var year = p2;
                    if (year >= 2500) year -= 543;
                    else if (year >= 50 && year < 100) year = (2500 + year) - 543;
                    else if (year >= 0 && year < 50) year = 2000 + year;
                    return $"{year:D4}-{p1:D2}-{p0:D2}{rollSuffix}".Trim();
                }
            }
        }
        return $"{trimmed}{rollSuffix}".Trim().Replace("ม้วน", "Roll");
    }
}
