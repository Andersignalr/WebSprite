var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();

var app = builder.Build();

app.UseHttpsRedirection();


app.UseDefaultFiles(); // permite index.html
app.UseStaticFiles();

app.MapHub<GameHub>("/gamehub");
app.Run();
