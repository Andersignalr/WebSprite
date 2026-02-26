// ===============================
// CANVAS
// ===============================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ===============================
// CONFIG
// ===============================

const MOVE_SPEED = 120; // pixels por segundo
const NETWORK_RATE = 50; // ms (20 updates por segundo)

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;
const FRAME_COUNT = 4;
const ANIMATION_SPEED = 10;

// ===============================
// ASSETS
// ===============================

const bg = new Image();
bg.src = "mapa.png";

const playerSprite = new Image();
playerSprite.src = "player.png";

// ===============================
// STATE
// ===============================

let players = {};
let myId = null;
let keys = {};
let lastTime = 0;
let animationTick = 0;
let lastNetworkUpdate = 0;

// ===============================
// SIGNALR
// ===============================

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/gamehub")
    .build();

connection.on("PlayerJoined", player => {
    players[player.id] = createPlayer(player);
});

connection.on("PlayerMoved", player => {
    if (!players[player.id]) return;

    if (player.id !== myId) {
        // Interpolação simples
        players[player.id].targetX = player.x;
        players[player.id].targetY = player.y;
    }
});

connection.on("PlayerLeft", id => {
    delete players[id];
});

connection.start().then(() => {
    myId = connection.connectionId;
});

// ===============================
// PLAYER FACTORY
// ===============================

function createPlayer(data) {
    return {
        id: data.id,
        x: data.x,
        y: data.y,
        targetX: data.x,
        targetY: data.y,
        direction: 0,
        frame: 0,
        moving: false
    };
}

// ===============================
// INPUT
// ===============================

document.addEventListener("keydown", e => {
    keys[e.key] = true;
});

document.addEventListener("keyup", e => {
    keys[e.key] = false;
});

// ===============================
// UPDATE
// ===============================

function update(deltaTime) {

    if (!players[myId]) return;

    let p = players[myId];
    p.moving = false;

    let distance = MOVE_SPEED * deltaTime;

    if (keys["ArrowUp"]) {
        p.y -= distance;
        p.direction = 3;
        p.moving = true;
    }

    if (keys["ArrowDown"]) {
        p.y += distance;
        p.direction = 0;
        p.moving = true;
    }

    if (keys["ArrowLeft"]) {
        p.x -= distance;
        p.direction = 1;
        p.moving = true;
    }

    if (keys["ArrowRight"]) {
        p.x += distance;
        p.direction = 2;
        p.moving = true;
    }

    // Interpolação dos outros players
    for (let id in players) {
        if (id === myId) continue;

        let other = players[id];

        other.x += (other.targetX - other.x) * 0.1;
        other.y += (other.targetY - other.y) * 0.1;
    }
}

// ===============================
// NETWORK TICK
// ===============================

function networkTick(time) {

    if (!players[myId]) return;

    if (time - lastNetworkUpdate > NETWORK_RATE) {
        let p = players[myId];
        connection.invoke("Move", p.x, p.y);
        lastNetworkUpdate = time;
    }
}

// ===============================
// RENDER
// ===============================

function render() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    // Ordenar por Y (profundidade 2.5D)
    const sortedPlayers = Object.values(players)
        .sort((a, b) => a.y - b.y);

    for (let p of sortedPlayers) {
        drawPlayer(p);
    }
}

function drawBackground() {
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
}

function drawPlayer(p) {

    if (!playerSprite.complete || playerSprite.naturalWidth === 0) return;

    if (p.moving) {
        animationTick++;
        if (animationTick % ANIMATION_SPEED === 0) {
            p.frame = (p.frame + 1) % FRAME_COUNT;
        }
    } else {
        p.frame = 0;
    }

    ctx.drawImage(
        playerSprite,
        p.frame * FRAME_WIDTH,
        p.direction * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        Math.round(p.x),
        Math.round(p.y),
        FRAME_WIDTH,
        FRAME_HEIGHT
    );
}

// ===============================
// GAME LOOP
// ===============================

function gameLoop(time) {

    let deltaTime = (time - lastTime) / 1000;
    lastTime = time;

    update(deltaTime);
    networkTick(time);
    render();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);