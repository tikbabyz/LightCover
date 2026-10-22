using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_IPO_Detail")]
    public class IpoDetail
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Column("run_no")]
        public int RunNo { get; set; }

        [Column("lot_slit")]
        public string LotSlit { get; set; } = string.Empty;

        [Column("lot_tap")]
        public string? LotTap { get; set; }

        [Column("lot_tap_2")]
        public string? LotTap2 { get; set; }

        [Column("lot_slit_2")]
        public string? LotSlit2 { get; set; }

        [Column("roll_slit")]
        public string? RollSlit { get; set; }

        [Column("total_roll_slit")]
        public string? TotalRollSlit { get; set; }

        [Column("roll_slit_2")]
        public string? RollSlit2 { get; set; }

        [Column("total_roll_slit_2")]
        public string? TotalRollSlit2 { get; set; }

        // Alias สำหรับ backward compatibility
        [NotMapped]
        public string LotEmboss
        {
            get => LotSlit;
            set => LotSlit = value;
        }

        [Column("start_time")]
        public string StartTime { get; set; } = string.Empty;

        [Column("end_time")]
        public string EndTime { get; set; } = string.Empty;

        [Column("total_meters")]
        public double TotalMeters { get; set; }

        [Column("downtime_note")]
        public string? DowntimeNote { get; set; }

        [Column("employee_name")]
        public string? EmployeeName { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }
    }
}
