using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace server.Models;

[Table("T_PER2_Slit_Detail")]
public class SlitDetail
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public int? Id { get; set; }

    [MaxLength(100)]
    [Column("job")]
    public string? Job { get; set; } = string.Empty;

    [Column("actualfoam_width")]
    public double? ActualFoamWidth { get; set; }

    [MaxLength(100)]
    [Column("emboss_lot")]
    public string? EmbossLot { get; set; } = string.Empty;

    [Column("emboss_roll")]
    public string? EmbossRoll { get; set; }

    [Column("emboss_total_roll")]
    public string? EmbossTotalRoll { get; set; }


    [Column("firstshot_thick")]
    public double? FirstShotThick { get; set; }

    [Column("firstshot_width")]
    public double? FirstShotWidth { get; set; }

    [Column("roll_used")]
    public int? RollUsed { get; set; }

    [Column("producted_qty")]
    public int? ProductedQty { get; set; }

    [Column("remain_thick")]
    public double? RemainThick { get; set; }

    [Column("remain_length")]
    public double? RemainLength { get; set; }

    [Column("remain_width")]
    public double? RemainWidth { get; set; }

    [Column("ng")]
    public double? Ng { get; set; }

    [Column("loss_overstd")]
    public double? LossOverStd { get; set; }

    [Column("loss_product")]
    public double? LossProduct { get; set; }

    [Column("actualused_qty")]
    public double? ActualUsedQty { get; set; }

    [Column("yield")]
    public double? Yield { get; set; }
}
