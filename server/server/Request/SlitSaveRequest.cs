using server.Models;

namespace server.Request
{
    // DTO สำหรับรับข้อมูลทั้ง Head และ Details ใน Request เดียว
    public class SlitSaveRequest
    {
        public SlitHead Head { get; set; } = new();
        public List<SlitDetail> Details { get; set; } = new();
        public bool IsEdit { get; set; } = false;
        public string? OriginalJob { get; set; }
    }
}
