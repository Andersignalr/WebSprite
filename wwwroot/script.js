const keys = {};
// =======================
// CANVAS
// =======================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// =======================
// BACKGROUND
// =======================

document.addEventListener("keydown", e => {
    keys[e.key] = true;
});

document.addEventListener("keyup", e => {
    keys[e.key] = false;
});

const bg = new Image();
bg.src = "mapa.png";

let bgLoaded = false;

bg.onload = () => {
    bgLoaded = true;
};

// =======================
// SPRITE CONFIG
// =======================

const playerSprite = new Image();
playerSprite.src = "player.png";

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;
const FRAME_COUNT = 4; // 4 colunas
const ANIMATION_SPEED = 8;

let animationTick = 0;

// =======================
// SIGNALR
// =======================

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/gamehub")
    .build();

let players = {};
let myId = null;

connection.on("PlayerJoined", player => {
    players[player.id] = {
        ...player,
        direction: 0, // 0 baixo, 1 esquerda, 2 direita, 3 cima
        frame: 0,
        moving: false
    };
});

connection.on("PlayerMoved", player => {
    if (!players[player.id]) return;

    players[player.id].x = player.x;
    players[player.id].y = player.y;
});

connection.on("PlayerLeft", id => {
    delete players[id];
});

connection.start().then(() => {
    myId = connection.connectionId;
});

// =======================
// MOVIMENTO
// =======================

document.addEventListener("keydown", e => {
    if (!players[myId]) return;

    let p = players[myId];
    p.moving = true;

    if (e.key === "ArrowUp") {
        p.y -= 5;
        p.direction = 3;
    }

    if (e.key === "ArrowDown") {
        p.y += 5;
        p.direction = 0;
    }

    if (e.key === "ArrowLeft") {
        p.x -= 5;
        p.direction = 1;
    }

    if (e.key === "ArrowRight") {
        p.x += 5;
        p.direction = 2;
    }

    connection.invoke("Move", p.x, p.y);
});

document.addEventListener("keyup", () => {
    if (!players[myId]) return;

    players[myId].moving = false;
    players[myId].frame = 0;
});

// =======================
// DRAW LOOP
// =======================

function gameLoop() {

    update();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgLoaded) {
        drawBackground();
    }

    for (let id in players) {
        drawPlayer(players[id]);
    }

    requestAnimationFrame(gameLoop);
}

function drawBackground() {
    const imgRatio = bg.width / bg.height;
    const canvasRatio = canvas.width / canvas.height;

    let drawWidth, drawHeight;

    if (imgRatio > canvasRatio) {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgRatio;
    } else {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgRatio;
    }

    const x = (canvas.width - drawWidth) / 2;
    const y = (canvas.height - drawHeight) / 2;

    ctx.drawImage(bg, x, y, drawWidth, drawHeight);
}

function drawPlayer(p) {

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

function update() {

    if (!players[myId]) return;

    let p = players[myId];
    let speed = 2;

    p.moving = false;

    if (keys["ArrowUp"]) {
        p.y -= speed;
        p.direction = 3;
        p.moving = true;
    }

    if (keys["ArrowDown"]) {
        p.y += speed;
        p.direction = 0;
        p.moving = true;
    }

    if (keys["ArrowLeft"]) {
        p.x -= speed;
        p.direction = 1;
        p.moving = true;
    }

    if (keys["ArrowRight"]) {
        p.x += speed;
        p.direction = 2;
        p.moving = true;
    }

    if (p.moving) {
        connection.invoke("Move", p.x, p.y);
    }
}

// =======================
// START
// =======================

gameLoop();