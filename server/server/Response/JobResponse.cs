namespace server.Responses
{
    public class JobResponse
    {
        public string Job { get; set; } = string.Empty;
        public DateTime JobDate { get; set; } = DateTime.MinValue;
        public string Item { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public double Thickness { get; set; } = 0.0;
        public double Width { get; set; } = 0.0;
        public double Length { get; set; } = 0.0;
        public double QtyReleased { get; set; } = 0.0;
        public string ColorCode { get; set; } = string.Empty;
        public string PvcColor { get; set; } = string.Empty;
        public string ColorName { get; set; } = string.Empty;
        public string MaterialType { get; set; } = string.Empty;
        public string FinishedItem { get; set; } = string.Empty;
        public string FinishedDescription { get; set; } = string.Empty;
        public string ItemMst { get; set; } = string.Empty;
    }
}
