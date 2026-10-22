namespace server.Responses
{
    public class BomResponse
    {
        public string Item { get; set; } = string.Empty;
        public int OperateNumber { get; set; }
        public string MaterialItem { get; set; } = string.Empty;
        public string MaterialDescription { get; set; } = string.Empty;
        public string MaterialColor { get; set; } = string.Empty;
        public string MaterialPVCColor { get; set; } = string.Empty;
        public double? Thickness { get; set; }
        public double? Width { get; set; }
        public double? Length { get; set; }
        public int MatlQty { get; set; }
        public int Sequence { get; set; }
    }
}
