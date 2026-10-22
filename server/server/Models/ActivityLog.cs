using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_Activity_Log")]
    public class ActivityLog
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        [Column("module")]
        public string Module { get; set; } = string.Empty; // "IPO_TUBE" or "SLIT"

        [Required]
        [MaxLength(100)]
        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        [Column("action_type")]
        public string ActionType { get; set; } = string.Empty; // "SAVE_ROLL", "EDIT_ROLL", "EDIT_CLOSED_JOB", "CLOSE_JOB", "REOPEN_JOB", "DELETE_ROLL"

        [MaxLength(50)]
        [Column("employee_id")]
        public string? EmployeeId { get; set; }

        [Required]
        [MaxLength(255)]
        [Column("employee_name")]
        public string EmployeeName { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        [Column("role")]
        public string Role { get; set; } = "operator"; // "officer", "operator", "admin"

        [Column("run_no")]
        public int? RunNo { get; set; }

        [Column("details")]
        public string? Details { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
