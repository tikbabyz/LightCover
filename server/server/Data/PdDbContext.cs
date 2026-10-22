using Microsoft.EntityFrameworkCore;

namespace server.Data
{
    public class PdDbContext : DbContext
    {
        public PdDbContext(DbContextOptions<PdDbContext> options) : base(options)
        {

        }
    }
}
