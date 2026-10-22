using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_Slit_Head")]
    public class SlitHead
    {
        [Key]
        [Column("id")]
        public int? Id { get; set; }
        [Column("job")]
        public string Job { get; set; } = string.Empty;
        [Column("part_no")]
        public string? PartNo { get; set; } = string.Empty;
        [Column("material_no")]
        public string? MaterialNo { get; set; } = string.Empty;
        [Column("description")]
        public string? Description { get; set; } = string.Empty;
        [Column("std_thick")]
        public double? StdThick { get; set; }
        [Column("std_width")]
        public double? StdWidth { get; set; }
        [Column("std_length")]
        public double? StdLength { get; set; }
        [Column("product_date", TypeName = "date")]
        public DateTime? ProductDate { get; set; }
        [Column("lot_number")]
        public string? LotNumber { get; set; } = string.Empty;

        [NotMapped]
        public string? LotNo
        {
            get => LotNumber;
            set => LotNumber = value;
        }
        [Column("employee_name")]
        public string? EmployeeName { get; set; } = string.Empty;
    }
}
