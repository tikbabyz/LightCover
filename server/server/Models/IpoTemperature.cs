using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models
{
    [Table("T_PER2_IPO_Temperature")] 
    public class IpoTemperature
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("job")]
        public string Job { get; set; } = string.Empty;

        [Column("detail_run_no")]
        public int DetailRunNo { get; set; }

        [Column("speed")]
        public double Speed { get; set; }

        [Column("temp1")]
        public double Temp1 { get; set; }

        [Column("temp2")]
        public double Temp2 { get; set; }

        [Column("temp3")]
        public double Temp3 { get; set; }

        [Column("temp4")]
        public double Temp4 { get; set; }

        [Column("temp_pipe")]
        public double TempPipe { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }
    }
}
