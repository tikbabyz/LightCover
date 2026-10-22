using server.Models;

namespace server.Request
{
    // DTO สำหรับรับข้อมูลบันทึกใบงาน IPO TUBE ทั้งหมดใน Request เดียว
    public class IpoSaveRequest
    {
        public IpoHead Head { get; set; } = new();
        public List<IpoDetail> Details { get; set; } = new();
        public List<IpoTemperature> Temperatures { get; set; } = new();
        public List<IpoDefect> Defects { get; set; } = new();
        public List<IpoTube1> Tube1List { get; set; } = new();
        public List<IpoTube2> Tube2List { get; set; } = new();
        public bool IsEdit { get; set; } = false;
    }
}
