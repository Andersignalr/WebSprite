using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

public class GameHub : Hub
{
    private static ConcurrentDictionary<string, Player> Players =
        new ConcurrentDictionary<string, Player>();

    public override async Task OnConnectedAsync()
    {
        var player = new Player
        {
            Id = Context.ConnectionId,
            X = 100,
            Y = 100
        };

        Players[Context.ConnectionId] = player;

        await Clients.All.SendAsync("PlayerJoined", player);
        await base.OnConnectedAsync();
    }

    public async Task Move(float x, float y)
    {
        if (Players.TryGetValue(Context.ConnectionId, out var player))
        {
            player.X = x;
            player.Y = y;

            await Clients.All.SendAsync("PlayerMoved", player);
        }
    }

    public override async Task OnDisconnectedAsync(Exception exception)
    {
        Players.TryRemove(Context.ConnectionId, out _);
        await Clients.All.SendAsync("PlayerLeft", Context.ConnectionId);

        await base.OnDisconnectedAsync(exception);
    }
}