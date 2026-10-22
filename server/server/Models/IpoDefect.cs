using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_IPO_Defect")]
    public class IpoDefect
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Column("detail_run_no")]
        public int DetailRunNo { get; set; }

        [Column("setting_machine")]
        public double SettingMachine { get; set; }

        [Column("joint_ipo")]
        public double JointIpo { get; set; }

        [Column("split_seam")]
        public double SplitSeam { get; set; }

        [Column("dimension_ng")]
        public double DimensionNg { get; set; }

        [Column("foam_detached")]
        public double FoamDetached { get; set; }

        [Column("joint_mark")]
        public double JointMark { get; set; }

        [Column("thick_ng")]
        public double ThickNg { get; set; }

        [Column("film_blemish")]
        public double FilmBlemish { get; set; }

        [Column("other_ng")]
        public double OtherNg { get; set; }
    }
}
