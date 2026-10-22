using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_IPO_Head")] // ปรับเปลี่ยนชื่อ Table ให้ตรงกับใน Database (เช่น T_PER2_IPO_Head หรือ IpoHead)
    public class IpoHead
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        [Column("part_no")]
        public string PartNo { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        [Column("description")]
        public string Description { get; set; } = string.Empty;

        [Required]
        [Column("lot_number", TypeName = "date")]
        public DateTime LotNumber { get; set; }

        [Required]
        [MaxLength(255)]
        [Column("employee_name")]
        public string EmployeeName { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        [Column("prod_name")]
        public string ProdName { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        [Column("tube1_spec")]
        public string Tube1Spec { get; set; } = string.Empty;

        [MaxLength(20)]
        [Column("tube2_spec")]
        public string? Tube2Spec { get; set; }

        [MaxLength(500)]
        [Column("downtime_note")]
        public string? DowntimeNote { get; set; }

        [Required]
        [MaxLength(20)]
        [Column("status")]
        public string Status { get; set; } = string.Empty;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }
}
