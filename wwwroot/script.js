const npcSprite = new Image();
npcSprite.src = "npc.png";

const NPC_FRAME_WIDTH = 32;
const NPC_FRAME_HEIGHT = 32;
const NPC_FRAME_COUNT = 6;
const NPC_ANIMATION_SPEED = 12;

let npcAnimationTick = 0;

let dialogActive = false;
let dialogLines = [];
let dialogIndex = 0;

let highlightPulse = 0;

let DEBUG_MODE = false;

let interactPressed = false;

let highlightedObject = null;

let tilesetImages = [];

const FOOT_WIDTH = 20;
const FOOT_HEIGHT = 10;

let mapData = null;
let collisionLayer = null;

let interactLayer = null;

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

let npcs = [];

function loadNPCs() {

    if (!mapData || !mapData.layers) {
        console.warn("mapData ainda não carregado");
        return;
    }

    const npcLayer = mapData.layers.find(l => l.name === "Interact");

    if (!npcLayer || !npcLayer.objects) {
        console.warn("Interact npc não encontrada");
        return;
    }

    for (let obj of npcLayer.objects) {

        // garante que é npc
        if (obj.type !== "npc") continue;

        let npc = {
            id: obj.id,
            name: obj.name || "npc",

            x: obj.x,
            y: obj.y - obj.height, // alinhar com tile

            width: obj.width,
            height: obj.height,

            sprite: new Image(),

            frameWidth: obj.width,
            frameHeight: obj.height,

            frameX: 0,
            frameTimer: 0,
            frameSpeed: 10,
            frameCount: 6,

            dialog: getProperty(obj, "dialog") || "..."
        };

        // caminho correto
        npc.sprite.src ="npc.png";

        npcs.push(npc);
    }

    console.log("NPCs carregados:", npcs.length);
}

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/gamehub")
    .build();

connection.on("PlayerJoined", player => {
    players[player.id] = createPlayer(player);
});

connection.on("PlayerMoved", player => {
    if (!players[player.id]) return;

    if (player.id !== myId) {

        let other = players[player.id];

        other.startX = other.x;
        other.startY = other.y;

        other.targetX = player.x;
        other.targetY = player.y;

        other.direction = player.direction;
        other.moving = player.moving;

        other.lerpTime = 0;
        other.lerpDuration = NETWORK_RATE / 1000; // tempo entre pacotes
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

    highlightPulse += 0.05;

    let p = players[myId];
    p.moving = false;

    let distance = MOVE_SPEED * deltaTime;

    let newX = p.x;
    let newY = p.y;

    if (keys["w"] || keys["W"]) {
        newY -= distance;
        p.direction = 3;
        p.moving = true;
    }

    if (keys["s"] || keys["S"]) {
        newY += distance;
        p.direction = 0;
        p.moving = true;
    }

    if (keys["a"] || keys["A"]) {
        newX -= distance;
        p.direction = 1;
        p.moving = true;
    }

    if (keys["d"] || keys["D"]) {
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

        if (other.lerpTime < other.lerpDuration) {

            other.lerpTime += deltaTime;

            let t = other.lerpTime / other.lerpDuration;

            if (t > 1) t = 1;

            // 🔥 AQUI entra o smoothstep
            t = t * t * (3 - 2 * t);

            other.x = other.startX + (other.targetX - other.startX) * t;
            other.y = other.startY + (other.targetY - other.startY) * t;
        }
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

    if (interactPressed) {

        interact();

        interactPressed = false;

    }

    npcAnimationTick++;

    if (npcAnimationTick % NPC_ANIMATION_SPEED === 0) {

        for (let npc of npcs) {

            npc.frame++;
            if (npc.frame >= NPC_FRAME_COUNT) {
                npc.frame = 0;
            }

        }

    }

    for (let npc of npcs) {

        npc.frameTimer++;

        if (npc.frameTimer >= npc.frameSpeed) {

            npc.frameTimer = 0;

            npc.frameX += npc.frameWidth;

            if (npc.frameX >= npc.frameWidth * npc.frameCount) {
                npc.frameX = 0;
            }
        }
    }
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

    highlightedObject = getInteractableObject(players[myId]);

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


    if (highlightedObject) {

        const pulse = (Math.sin(performance.now() * 0.005) + 1) / 2;

        const x = highlightedObject.x - camera.x + highlightedObject.width / 2;
        const y = highlightedObject.y - camera.y - 10 - pulse * 4;

        ctx.fillStyle = "yellow";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";

        ctx.fillText("E", x, y);

        ctx.beginPath();
        ctx.arc(x, y - 4, 10 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = "yellow";
        ctx.stroke();
    }

    

    renderDebug();
    renderHUD();

    if (dialogActive) {

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(40, canvas.height - 120, canvas.width - 80, 80);

        ctx.strokeStyle = "white";
        ctx.strokeRect(40, canvas.height - 120, canvas.width - 80, 80);

        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.textAlign = "left";

        ctx.fillText(
            dialogLines[dialogIndex],
            60,
            canvas.height - 80
        );

    }
    //NPC
    for (let npc of npcs) {
        drawNPC(npc);
    }
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
        
        interactLayer = mapData.layers.find(l => l.name === "Interact");

        loadNPCs();

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



document.addEventListener("keydown", (e) => {

    if (e.key === "e" || e.key === "E") {

        if (dialogActive) {

            dialogIndex++;

            if (dialogIndex >= dialogLines.length) {
                dialogActive = false;
            }

            return;
        }

        interactPressed = true;

    }

});




function handleInteraction(obj) {

    if (!obj) return;

    switch (obj.type) {

        case "npc":

            let dialog = getProperty(obj, "dialog") || "...";
            dialogIndex = 0;
            dialogActive = true;

            break;

        case "chest":
            console.log("Abrindo baú!");
            break;

        case "door":
            console.log("Entrando na porta!");
            break;

        default:
            console.log("Tipo desconhecido:", obj.type);
    }
}

function getInteractionPoint(player) {

    if (!player) {
        return { x: 0, y: 0 };
    }

    const centerX = player.x + FRAME_WIDTH / 2;
    const feetY = player.y + FRAME_HEIGHT;

    const offset = 12;

    switch (player.direction) {

        case 3: // up
            return { x: centerX, y: player.y - offset };

        case 0: // down
            return { x: centerX, y: feetY + offset };

        case 1: // left
            return { x: player.x - offset, y: feetY - 8 };

        case 2: // right
            return { x: player.x + FRAME_WIDTH + offset, y: feetY - 8 };

        default:
            return { x: centerX, y: feetY }; // fallback
    }
}

function renderDebug() {

    if (!DEBUG_MODE) return;
    if (!players[myId]) return;

    // 🔴 Hitbox do pé
    let foot = getFootHitbox(players[myId].x, players[myId].y);

    ctx.strokeStyle = "red";
    ctx.strokeRect(
        foot.x - camera.x,
        foot.y - camera.y,
        foot.width,
        foot.height
    );

    // 🔵 Área dos objetos interativos
    if (interactLayer) {
        for (let obj of interactLayer.objects) {

            ctx.strokeStyle = "blue";
            ctx.strokeRect(
                obj.x - camera.x,
                obj.y - camera.y,
                obj.width,
                obj.height
            );
        }
    }

    // 🟡 Ponto de interação frontal
    let point = getInteractionPoint(players[myId]);

    if (point) {
        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(
            point.x - camera.x,
            point.y - camera.y,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    //colision box
    const tileSize = mapData.tilewidth;

    for (let row = 0; row < mapData.height; row++) {
        for (let col = 0; col < mapData.width; col++) {

            const index = row * mapData.width + col;
            const gid = collisionLayer.data[index];

            if (gid === 0) continue;

            ctx.fillStyle = "rgba(255, 0, 255, 0.3)"; // roxo transparente

            ctx.fillRect(
                col * tileSize - camera.x,
                row * tileSize - camera.y,
                tileSize,
                tileSize
            );
        }
    }

    //pes tocando
    if (DEBUG_MODE && players[myId]) {

        const tileSize = mapData.tilewidth;
        const foot = getFootHitbox(players[myId].x, players[myId].y);

        let leftTile = Math.floor(foot.x / tileSize);
        let rightTile = Math.floor((foot.x + foot.width - 1) / tileSize);
        let topTile = Math.floor(foot.y / tileSize);
        let bottomTile = Math.floor((foot.y + foot.height - 1) / tileSize);

        ctx.strokeStyle = "lime";
        ctx.lineWidth = 2;

        const tiles = [
            [leftTile, topTile],
            [rightTile, topTile],
            [leftTile, bottomTile],
            [rightTile, bottomTile]
        ];

        for (let [col, row] of tiles) {
            ctx.strokeRect(
                col * tileSize - camera.x,
                row * tileSize - camera.y,
                tileSize,
                tileSize
            );
        }
    }
}

document.addEventListener("keydown", e => {
    if (e.key === "F2") {
        DEBUG_MODE = !DEBUG_MODE;
        console.log("DEBUG:", DEBUG_MODE ? "ON" : "OFF");
    }
});

function renderHUD() {

    if (!DEBUG_MODE) return;
    if (!players[myId]) return;

    const p = players[myId];

    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";

    ctx.fillText(`Player X: ${p.x.toFixed(1)}`, 10, 20);
    ctx.fillText(`Player Y: ${p.y.toFixed(1)}`, 10, 40);

    const tileSize = mapData.tilewidth;

    const tileX = Math.floor(p.x / tileSize);
    const tileY = Math.floor(p.y / tileSize);

    ctx.fillText(`Tile X: ${tileX}`, 10, 60);
    ctx.fillText(`Tile Y: ${tileY}`, 10, 80);

    ctx.fillText(`Camera X: ${camera.x.toFixed(1)}`, 10, 100);
    ctx.fillText(`Camera Y: ${camera.y.toFixed(1)}`, 10, 120);
}

function getInteractableObject(player) {

    const point = getInteractionPoint(player);
    if (!point) return;

    let closest = null;
    let closestDist = Infinity;

    for (let obj of interactLayer.objects) {

        let objTop = obj.y;

        if (
            point.x >= obj.x &&
            point.x <= obj.x + obj.width &&
            point.y >= objTop &&
            point.y <= objTop + obj.height
        ) {

            let dx = point.x - (obj.x + obj.width / 2);
            let dy = point.y - (objTop + obj.height / 2);

            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist) {
                closestDist = dist;
                closest = obj;
            }

        }

    }

    return closest;

}

function interact() {

    let player = players[myId];
    if (!player) return;

    let obj = getInteractableObject(player);
    if (!obj) return;

    handleInteraction(obj);

}

loadNPCs();

function drawNPC(npc) {

    ctx.drawImage(
        npc.sprite,
        npc.frameX * npc.FRAME_WIDTH,
        0,
        npc.frameWidth,
        npc.frameHeight,
        Math.round(npc.x - camera.x),
        Math.round(npc.y - camera.y),
        npc.frameWidth,
        npc.frameHeight
    );

}

function getProperty(obj, name) {

    if (!obj.properties) return null;

    let prop = obj.properties.find(p => p.name === name);

    return prop ? prop.value : null;
}