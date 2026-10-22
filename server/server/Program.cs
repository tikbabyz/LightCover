using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using server.Config;
using System.Text;
using server.Data;

// Configure Dapper to map snake_case columns (run_no, start_time, etc.) to PascalCase properties
Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);

// ==================== Service Registration ====================

// Controller & Global Authorization Policy
builder.Services.AddControllers(options =>
{
    var policy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
    options.Filters.Add(new AuthorizeFilter(policy));
});

// ==================== Swagger/OpenAPI ====================
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ==================== CORS Policy ====================
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ==================== DbContext ====================
builder.Services.AddDbContext<IitDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("IIT_ConnectionString")));
builder.Services.AddDbContext<LiveAppContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("LiveApp_ConnectionString")));
builder.Services.AddDbContext<PdDbContext>(options =>
   options.UseSqlServer(builder.Configuration.GetConnectionString("PD_ConnectionString")));



// ==================== JWT Settings & Authentication ====================
builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection("Jwt"));

var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
                ?? throw new InvalidOperationException("Jwt settings not configured");
var keyBytes = Encoding.UTF8.GetBytes(jwtSettings.Key);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// ==================== Build App ====================

var app = builder.Build();

// ==================== Middleware ====================

app.UseCors("AllowFrontend");

app.UseSwagger();
app.UseSwaggerUI();


app.UseAuthentication();
app.UseAuthorization();

// ==================== Run ====================

app.MapControllers();

app.Run();