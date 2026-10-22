using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using server.Models;

namespace server.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class ActivityLogController : ControllerBase
{
    private readonly string IIT_connectionString;

    public ActivityLogController(IConfiguration configuration)
    {
        IIT_connectionString = configuration.GetConnectionString("IIT_ConnectionString")!;
    }

    // 1. GET: api/activitylog
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? job,
        [FromQuery] string? module,
        [FromQuery] string? actionType,
        [FromQuery] int limit = 100)
    {
        if (limit <= 0) limit = 50;
        if (limit > 500) limit = 500;

        using var connection = new SqlConnection(IIT_connectionString);

        string sql = @"
            SELECT TOP (@Limit)
                id AS Id,
                module AS Module,
                job AS Job,
                action_type AS ActionType,
                employee_id AS EmployeeId,
                employee_name AS EmployeeName,
                role AS Role,
                run_no AS RunNo,
                details AS Details,
                created_at AS CreatedAt
            FROM T_PER2_Activity_Log
            WHERE (@Job IS NULL OR job = @Job OR job LIKE '%' + @Job + '%')
              AND (@Module IS NULL OR module = @Module)
              AND (@ActionType IS NULL OR action_type = @ActionType)
            ORDER BY created_at DESC, id DESC";

        var logs = (await connection.QueryAsync<ActivityLog>(sql, new
        {
            Job = string.IsNullOrWhiteSpace(job) ? null : job.Trim(),
            Module = string.IsNullOrWhiteSpace(module) ? null : module.Trim(),
            ActionType = string.IsNullOrWhiteSpace(actionType) ? null : actionType.Trim(),
            Limit = limit
        })).ToList();

        foreach (var l in logs)
        {
            l.CreatedAt = DateTime.SpecifyKind(l.CreatedAt, DateTimeKind.Utc);
        }

        return Ok(logs);
    }

    // 2. GET: api/activitylog/job/{job}
    [HttpGet("job/{job}")]
    public async Task<IActionResult> GetByJob(string job)
    {
        if (string.IsNullOrWhiteSpace(job))
        {
            return BadRequest(new { message = "Job number is required" });
        }

        using var connection = new SqlConnection(IIT_connectionString);

        string sql = @"
            SELECT 
                id AS Id,
                module AS Module,
                job AS Job,
                action_type AS ActionType,
                employee_id AS EmployeeId,
                employee_name AS EmployeeName,
                role AS Role,
                run_no AS RunNo,
                details AS Details,
                created_at AS CreatedAt
            FROM T_PER2_Activity_Log
            WHERE job = @Job
            ORDER BY created_at ASC, id ASC";

        var logs = (await connection.QueryAsync<ActivityLog>(sql, new { Job = job.Trim() })).ToList();
        foreach (var l in logs)
        {
            l.CreatedAt = DateTime.SpecifyKind(l.CreatedAt, DateTimeKind.Utc);
        }
        return Ok(logs);
    }

    // 3. POST: api/activitylog
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ActivityLog log)
    {
        if (log == null || string.IsNullOrWhiteSpace(log.Job))
        {
            return BadRequest(new { message = "Job and details are required" });
        }

        using var connection = new SqlConnection(IIT_connectionString);

        var now = DateTime.UtcNow;
        if (log.CreatedAt == default || log.CreatedAt < new DateTime(2000, 1, 1))
        {
            log.CreatedAt = now;
        }
        else
        {
            log.CreatedAt = DateTime.SpecifyKind(log.CreatedAt, DateTimeKind.Utc);
        }

        log.Module = string.IsNullOrWhiteSpace(log.Module) ? "IPO_TUBE" : log.Module.Trim();
        log.Job = log.Job.Trim();
        log.ActionType = string.IsNullOrWhiteSpace(log.ActionType) ? "LOG" : log.ActionType.Trim();
        log.EmployeeName = string.IsNullOrWhiteSpace(log.EmployeeName) ? "Unknown" : log.EmployeeName.Trim();
        log.Role = string.IsNullOrWhiteSpace(log.Role) ? "operator" : log.Role.Trim().ToLower();

        string sql = @"
            INSERT INTO T_PER2_Activity_Log
            (module, job, action_type, employee_id, employee_name, role, run_no, details, created_at)
            OUTPUT INSERTED.id
            VALUES
            (@Module, @Job, @ActionType, @EmployeeId, @EmployeeName, @Role, @RunNo, @Details, @CreatedAt)";

        try
        {
            int newId = await connection.ExecuteScalarAsync<int>(sql, log);
            log.Id = newId;
            return Ok(new { success = true, log = log });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ActivityLogController Error] {ex}");
            return StatusCode(500, new { message = "Error saving activity log", error = ex.Message });
        }
    }

    // 4. DELETE: api/activitylog
    [HttpDelete]
    public async Task<IActionResult> DeleteAll()
    {
        using var connection = new SqlConnection(IIT_connectionString);
        string sql = "DELETE FROM T_PER2_Activity_Log";
        try
        {
            int count = await connection.ExecuteAsync(sql);
            return Ok(new { success = true, message = $"Cleared {count} activity logs" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ActivityLogController DeleteAll Error] {ex}");
            return StatusCode(500, new { message = "Error clearing activity logs", error = ex.Message });
        }
    }

    // 5. DELETE: api/activitylog/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteById(int id)
    {
        using var connection = new SqlConnection(IIT_connectionString);
        string sql = "DELETE FROM T_PER2_Activity_Log WHERE id = @Id";
        try
        {
            int count = await connection.ExecuteAsync(sql, new { Id = id });
            return Ok(new { success = true, message = $"Deleted activity log {id}" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ActivityLogController DeleteById Error] {ex}");
            return StatusCode(500, new { message = "Error deleting activity log", error = ex.Message });
        }
    }
}

