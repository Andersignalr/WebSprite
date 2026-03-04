let tilesetImages = [];

const FOOT_WIDTH = 20;
const FOOT_HEIGHT = 10;

let mapData = null;
let collisionLayer = null;

// ===============================
// WORLD CONFIG
// ===============================

let MAP_WIDTH = 0;
let MAP_HEIGHT = 0;


const DEAD_ZONE_WIDTH = 200;
const DEAD_ZONE_HEIGHT = 150;

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

const camera = {
    x: 0,
    y: 0
};

// ===============================
// ASSETS
// ===============================

const bg = new Image();

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

    console.log("Recebido do servidor:", player);

    if (player.id !== myId) {
        // Interpolação simples
        if (player.id !== myId) {

            let other = players[player.id];

            other.targetX = player.x;
            other.targetY = player.y;

            other.direction = player.direction;
            other.moving = player.moving;
        }
    }
});

connection.on("PlayerLeft", id => {
    delete players[id];
});

connection.on("ExistingPlayers", serverPlayers => {
    serverPlayers.forEach(p => {
        players[p.id] = createPlayer(p);
    });
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

// está colidindo

function getFootHitbox(x, y) {

    return {
        x: x + (FRAME_WIDTH - FOOT_WIDTH) / 2,
        y: y + FRAME_HEIGHT - FOOT_HEIGHT,
        width: FOOT_WIDTH,
        height: FOOT_HEIGHT
    };
}
function isColliding(x, y) {

    if (!collisionLayer) return false;

    const tileSize = mapData.tilewidth;
    const mapWidth = mapData.width;

    const foot = getFootHitbox(x, y);

    let leftTile = Math.floor(foot.x / tileSize);
    let rightTile = Math.floor((foot.x + foot.width - 1) / tileSize);
    let topTile = Math.floor(foot.y / tileSize);
    let bottomTile = Math.floor((foot.y + foot.height - 1) / tileSize);

    function isBlocked(col, row) {

        if (
            col < 0 ||
            row < 0 ||
            col >= mapData.width ||
            row >= mapData.height
        ) return true;

        const index = row * mapWidth + col;
        return collisionLayer.data[index] !== 0;
    }

    return (
        isBlocked(leftTile, topTile) ||
        isBlocked(rightTile, topTile) ||
        isBlocked(leftTile, bottomTile) ||
        isBlocked(rightTile, bottomTile)
    );
}
//

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

    let newX = p.x;
    let newY = p.y;

    if (keys["ArrowUp"]) {
        newY -= distance;
        p.direction = 3;
        p.moving = true;
    }

    if (keys["ArrowDown"]) {
        newY += distance;
        p.direction = 0;
        p.moving = true;
    }

    if (keys["ArrowLeft"]) {
        newX -= distance;
        p.direction = 1;
        p.moving = true;
    }

    if (keys["ArrowRight"]) {
        newX += distance;
        p.direction = 2;
        p.moving = true;
    }

    // 🔥 Testar colisão antes de aplicar
    if (!isColliding(newX, p.y)) {
        p.x = newX;
    }

    if (!isColliding(p.x, newY)) {
        p.y = newY;
    }

    // ===============================
    // LIMITAR PLAYER AO MAPA
    // ===============================

    p.x = Math.max(0, Math.min(p.x, MAP_WIDTH - FRAME_WIDTH));
    p.y = Math.max(0, Math.min(p.y, MAP_HEIGHT - FRAME_HEIGHT));

    // Interpolação dos outros players
    for (let id in players) {
        if (id === myId) continue;

        let other = players[id];

        let prevX = other.x;
        let prevY = other.y;

        other.x += (other.targetX - other.x) * 0.1;
        other.y += (other.targetY - other.y) * 0.1;


        // Detectar movimento
        //other.moving = Math.abs(other.x - prevX) > 0.01 ||
        //    Math.abs(other.y - prevY) > 0.01;

        // Atualizar direção baseado no movimento
        //let dx = other.targetX - other.x;
        //let dy = other.targetY - other.y;

        //if (Math.abs(dx) > Math.abs(dy)) {
        //    other.direction = dx > 0 ? 2 : 1; // direita : esquerda
        //} else {
        //    other.direction = dy > 0 ? 0 : 3; // baixo : cima
        //}
    }

    // ===============================
    // CAMERA FOLLOW (Dead Zone + Smooth)
    // ===============================

    // Centro real do player (importante!)
    let playerCenterX = p.x + FRAME_WIDTH / 2;
    let playerCenterY = p.y + FRAME_HEIGHT / 2;

    // Centro atual da câmera
    let cameraCenterX = camera.x + canvas.width / 2;
    let cameraCenterY = camera.y + canvas.height / 2;

    let dx = playerCenterX - cameraCenterX;
    let dy = playerCenterY - cameraCenterY;

    let targetX = camera.x;
    let targetY = camera.y;

    // Horizontal
    if (Math.abs(dx) > DEAD_ZONE_WIDTH / 2) {
        targetX += dx - Math.sign(dx) * (DEAD_ZONE_WIDTH / 2);
    }

    // Vertical
    if (Math.abs(dy) > DEAD_ZONE_HEIGHT / 2) {
        targetY += dy - Math.sign(dy) * (DEAD_ZONE_HEIGHT / 2);
    }

    // 🔥 Suavização
    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;

    // Limitar câmera ao mapa
    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - canvas.height));
}

// ===============================
// NETWORK TICK
// ===============================

function networkTick(time) {

    if (!players[myId]) return;

    if (time - lastNetworkUpdate > NETWORK_RATE) {
        let p = players[myId];
        connection.invoke(
            "Move",
            p.x,
            p.y,
            p.direction,
            p.moving
        );
        lastNetworkUpdate = time;
    }
}

// ===============================
// RENDER
// ===============================
function getTilesetForGid(gid) {

    let selected = null;

    for (let ts of tilesetImages) {
        if (gid >= ts.firstgid) {
            selected = ts;
        }
    }

    return selected;
}

function drawTileLayer(layerName) {

    const layer = mapData.layers.find(l => l.name === layerName);
    if (!layer) return;

    const tileSize = mapData.tilewidth;

    for (let row = 0; row < mapData.height; row++) {
        for (let col = 0; col < mapData.width; col++) {

            const index = row * mapData.width + col;
            const gid = layer.data[index];

            if (gid === 0) continue;

            const tileset = getTilesetForGid(gid);
            if (!tileset) continue;

            const localId = gid - tileset.firstgid;

            const sx = (localId % tileset.columns) * tileset.tileWidth;
            const sy = Math.floor(localId / tileset.columns) * tileset.tileHeight;

            const dx = col * tileSize - camera.x;
            const dy = row * tileSize - camera.y;

            ctx.drawImage(
                tileset.image,
                sx, sy,
                tileset.tileWidth, tileset.tileHeight,
                dx, dy,
                tileset.tileWidth, tileset.tileHeight
            );
        }
    }
}

function render() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1️⃣ Chão
    drawTileLayer("Ground");

    drawTileLayer("Ground_obj");


    // 2️⃣ Player
    const sortedPlayers = Object.values(players)
        .sort((a, b) =>
            (a.y + FRAME_HEIGHT) - (b.y + FRAME_HEIGHT)
        );

    for (let p of sortedPlayers) {
        drawPlayer(p);
    }

    // 3️⃣ Over (na frente)
    drawTileLayer("Over");
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
        Math.round(p.x - camera.x),
        Math.round(p.y - camera.y),
        FRAME_WIDTH,
        FRAME_HEIGHT
    );
}

function loadTilesets() {

    const promises = [];

    mapData.tilesets.forEach(ts => {

        const img = new Image();
        img.src = ts.image;

        const p = new Promise(resolve => {
            img.onload = () => resolve();
        });

        tilesetImages.push({
            firstgid: ts.firstgid,
            image: img,
            tileWidth: ts.tilewidth,
            tileHeight: ts.tileheight,
            columns: Math.floor(ts.imagewidth / ts.tilewidth)
        });

        promises.push(p);
    });

    return Promise.all(promises);
}

fetch("mapa.json")
    .then(res => res.json())
    .then(data => {
        mapData = data;

        collisionLayer = mapData.layers.find(l => l.name === "Collision");

        // 🔥 Atualizar tamanho real do mapa baseado no Tiled
        MAP_WIDTH = mapData.width * mapData.tilewidth;
        MAP_HEIGHT = mapData.height * mapData.tileheight;

        loadTilesets().then(() => {
            requestAnimationFrame(gameLoop);
        });
    });

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

//requestAnimationFrame(gameLoop);