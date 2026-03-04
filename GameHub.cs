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

        // Envia todos jogadores existentes para quem acabou de entrar
        await Clients.Caller.SendAsync("ExistingPlayers", Players.Values);

        // Adiciona novo jogador
        Players[player.Id] = player;

        // Avisa todos sobre o novo jogador
        await Clients.All.SendAsync("PlayerJoined", player);

        await base.OnConnectedAsync();
    }

    public async Task Move(float x, float y, int direction, bool moving)
    {
        if (Players.TryGetValue(Context.ConnectionId, out var player))
        {
            player.X = x;
            player.Y = y;
            player.Direction = direction;
            player.Moving = moving;

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