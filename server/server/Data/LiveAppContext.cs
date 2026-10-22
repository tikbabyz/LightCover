using Microsoft.EntityFrameworkCore;

namespace server.Data
{
    public class LiveAppContext : DbContext
    {
        public LiveAppContext(DbContextOptions<LiveAppContext> options) : base(options)
        {

        }
    }
}
