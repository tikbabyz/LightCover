using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_IPO_Tube2")]
    public class IpoTube2
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Column("detail_run_no")]
        public int DetailRunNo { get; set; }

        [Column("inside_dia_1")]
        public double InsideDia1 { get; set; }

        [Column("inside_dia_2")]
        public double InsideDia2 { get; set; }

        [Column("inside_dia_avg")]
        public double InsideDiaAvg { get; set; }

        [Column("thickness_1")]
        public double Thickness1 { get; set; }

        [Column("thickness_2")]
        public double Thickness2 { get; set; }

        [Column("thickness_3")]
        public double Thickness3 { get; set; }

        [Column("thickness_4")]
        public double Thickness4 { get; set; }

        [Column("thickness_avg")]
        public double ThicknessAvg { get; set; }

        [Column("judgement")]
        public string? Judgement { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }
    }
}
