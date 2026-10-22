using Microsoft.EntityFrameworkCore;
using server.Models;

namespace server.Data
{
    public class IitDbContext : DbContext
    {
        public IitDbContext(DbContextOptions<IitDbContext> options) : base(options)
        {

        }
        public DbSet<SlitHead> SlitHeads => Set<SlitHead>();
        public DbSet<SlitDetail> SlitDetails => Set<SlitDetail>();
        public DbSet<IpoHead> IpoHeads => Set<IpoHead>();
        public DbSet<IpoDetail> IpoDetails => Set<IpoDetail>();
        public DbSet<IpoTemperature> IpoTemperatures => Set<IpoTemperature>();
        public DbSet<IpoDefect> IpoDefects => Set<IpoDefect>();
        public DbSet<IpoTube1> IpoTube1s => Set<IpoTube1>();
        public DbSet<IpoTube2> IpoTube2s => Set<IpoTube2>();
        public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    }
}
