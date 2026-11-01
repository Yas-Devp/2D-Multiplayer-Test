const socket = io('http://localhost:3000');

// Player name (remembered between visits)
let myName = localStorage.getItem('huddle-name') || '';
myName = (prompt('Choose your name:', myName) || '').trim().slice(0, 16)
    || 'Player' + Math.floor(Math.random() * 1000);
localStorage.setItem('huddle-name', myName);

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d',
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    pixelArt: true,
};

const game = new Phaser.Game(config);
let player;
let otherPlayers = {};
let cursors;
let wasd;

// Distance from a sprite's centre (y) to the bottom of its collision body.
// scale 1.5 * (offsetY 30 + body height 9 - displayOriginY 24) = 22.5
// Remote players have no physics body, so we use this for their Y-sorting.
const FOOT_OFFSET = 1.5 * (30 + 9 - 24);

// How far above the sprite's centre the name floats. Tweak to taste.
const NAME_OFFSET_Y = 30;

function createNameLabel(scene, name) {
    return scene.add.text(0, 0, name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 4 // keeps text crisp under the 2x camera zoom
    }).setOrigin(0.5, 1).setDepth(100000); // always drawn above furniture and players
}

function updateNameLabel(sprite) {
    if (sprite.nameLabel) {
        sprite.nameLabel.setPosition(Math.round(sprite.x), Math.round(sprite.y - NAME_OFFSET_Y));
    }
}

// Throttling for outgoing movement packets
const SEND_INTERVAL_MS = 50;
let lastSentAt = 0;
let lastSent = { x: null, y: null, anim: null };

function preload() {
    this.load.spritesheet('player', 'assets/characters/Adventurer.png', { frameWidth: 48, frameHeight: 48 });
    this.load.tilemapTiledJSON('map', 'assets/maps/rooms1.json');
    this.load.image('doors', 'assets/maps/room1_assets/doors_windows_stairs.png');
    this.load.image('floors', 'assets/maps/room1_assets/floors.png');
    this.load.image('furniture', 'assets/maps/room1_assets/furniture1.png');
    this.load.image('items', 'assets/maps/room1_assets/items.png');
}

function findTileset(map, gid) {
    return map.tilesets.find(ts =>
        gid >= ts.firstgid && gid < ts.firstgid + ts.total && ts.image
    ) || null;
}

function create() {
    const map = this.make.tilemap({ key: 'map' });

    const tilesetDoors     = map.addTilesetImage('doors_stairs', 'doors');
    const tilesetFloors    = map.addTilesetImage('floors', 'floors');
    const tilesetFurniture = map.addTilesetImage('furniture1', 'furniture');
    const tilesetItems     = map.addTilesetImage('items', 'items');

    const allTilesets = [tilesetFloors, tilesetDoors, tilesetFurniture, tilesetItems];

    const floorLayer      = map.createLayer('floor', allTilesets, 0, 0);
    const wallsLayer      = map.createLayer('walls', allTilesets, 0, 0);
    const furnitureLayer  = map.createLayer(1, allTilesets, 0, 0);
    const furniture2Layer = map.createLayer(2, allTilesets, 0, 0);
    const itemsLayer      = map.createLayer('items', allTilesets, 0, 0);

    const anim = (key, start, end, frameRate) =>
        this.anims.create({ key, frames: this.anims.generateFrameNumbers('player', { start, end }), frameRate, repeat: -1 });

    anim('idle-down', 0, 1, 2);
    anim('idle-left', 2, 3, 2);
    anim('idle-right', 4, 5, 2);
    anim('idle-up', 6, 7, 2);
    anim('walk-down', 8, 11, 10);
    anim('walk-left', 12, 15, 10);
    anim('walk-right', 16, 19, 10);
    anim('walk-up', 20, 23, 10);

    //creating player
    player = this.physics.add.sprite(200, 200, 'player').setScale(1.5);
    player.setCollideWorldBounds(true);
    player.play('idle-down');
    player.body.setSize(9, 9);
    player.body.setOffset(20, 30);
    player.nameLabel = createNameLabel(this, myName);

    const sortLayers = [furnitureLayer, furniture2Layer, itemsLayer];
    floorLayer.setDepth(0);
    wallsLayer.setDepth(0);
    sortLayers.forEach(l => l.setDepth(1));

    const walls = this.physics.add.staticGroup();
    const collisionObjects = map.getObjectLayer('Collisions').objects
        .filter(o => o.width && o.height)
        .sort((a, b) => a.y - b.y);

    const EXTRA_ABOVE = map.tileHeight * 2;

    collisionObjects.forEach(obj => {
        const zone = this.add.zone(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
        this.physics.add.existing(zone, true);
        walls.add(zone);

        const sortDepth = obj.y + obj.height;
        const regionY = obj.y - EXTRA_ABOVE;
        const regionH = obj.height + EXTRA_ABOVE;

        sortLayers.forEach(layer => {
            const tiles = layer.getTilesWithinWorldXY(obj.x, regionY, obj.width, regionH, { isNotEmpty: true });
            tiles.forEach(tile => {
                const tileset = findTileset(map, tile.index);
                if (!tileset) return;

                const texKey = tileset.image.key;
                const texture = this.textures.get(texKey);
                const frameName = 'tile_' + tile.index;

                if (!texture.has(frameName)) {
                    const localIndex = tile.index - tileset.firstgid;
                    const col = localIndex % tileset.columns;
                    const row = Math.floor(localIndex / tileset.columns);
                    const fx = tileset.tileMargin + col * (tileset.tileWidth + tileset.tileSpacing);
                    const fy = tileset.tileMargin + row * (tileset.tileHeight + tileset.tileSpacing);
                    texture.add(frameName, 0, fx, fy, tileset.tileWidth, tileset.tileHeight);
                }

                this.add.image(layer.x + tile.pixelX, layer.y + tile.pixelY + tile.height, texKey, frameName)
                    .setOrigin(0, 1)
                    .setFlip(tile.flipX, tile.flipY)
                    .setDepth(sortDepth);

                layer.removeTileAt(tile.x, tile.y);
            });
        });
    });

    const mapWidth = map.widthInPixels;
    const mapHeight = map.heightInPixels;
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(player);
    this.cameras.main.setZoom(2);
    this.physics.add.collider(player, walls);

    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys('W,A,S,D');

    // Everything above is finished: the scene, animations and local player all exist.
    // Only NOW do we touch the network.
    setupMultiplayer(this);
}

/* ------------------------------------------------------------------ */
/*  Multiplayer                                                        */
/* ------------------------------------------------------------------ */

function setupMultiplayer(scene) {
    const handlers = {};
    const listen = (event, fn) => {
        handlers[event] = fn;
        socket.on(event, fn);
    };

    // Ask the server for the player list (and announce ourselves).
    const join = () => socket.emit('getPlayers', { x: player.x, y: player.y, name: myName });

    listen('currentPlayers', (players) => {
        Object.values(players).forEach((info) => {
            if (info.id !== socket.id) addOtherPlayer(scene, info);
        });
    });

    listen('newPlayer', (info) => {
        if (info.id !== socket.id) addOtherPlayer(scene, info);
    });

    listen('playerMoved', (info) => {
        if (info.id === socket.id) return;
        // If we somehow never heard about this player, spawn them now
        // instead of silently ignoring them forever.
        const other = addOtherPlayer(scene, info);
        if (!other) return;

        other.setPosition(info.x, info.y);
        if (info.anim && scene.anims.exists(info.anim)) {
            other.anims.play(info.anim, true);
        }
    });

    listen('playerDisconnected', (id) => removeOtherPlayer(id));

    // Connection dropped: the server forgets us, so wipe stale remote sprites.
    listen('disconnect', () => clearOtherPlayers());

    // Fires on the first connection AND on every automatic reconnect
    // (a reconnect gives us a NEW socket.id, so we must join again).
    listen('connect', () => {
        clearOtherPlayers();
        join();
    });

    // Already connected by the time the scene finished loading? Join now.
    if (socket.connected) join();

    // If the scene is ever shut down, don't leave listeners pointing at a dead scene.
    scene.events.once('shutdown', () => {
        Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
        clearOtherPlayers();
    });
}

function addOtherPlayer(scene, info) {
    // Reuse an existing live sprite
    const existing = otherPlayers[info.id];
    if (existing && existing.active) return existing;
    if (existing) delete otherPlayers[info.id]; // stale/destroyed entry

    // Scene might be shutting down
    if (!scene.sys || !scene.sys.isActive()) return null;

    const other = scene.add.sprite(info.x, info.y, 'player')
        .setScale(1.5);
    other.nameLabel = createNameLabel(scene, info.name || 'Player');

    // No physics body: remote players are positioned purely by network data.
    const key = info.anim && scene.anims.exists(info.anim) ? info.anim : 'idle-down';
    other.play(key);
    other.setDepth(info.y + FOOT_OFFSET);
    updateNameLabel(other);

    otherPlayers[info.id] = other;
    return other;
}

function removeOtherPlayer(id) {
    const other = otherPlayers[id];
    if (other) {
        if (other.nameLabel) other.nameLabel.destroy();
        if (other.active) other.destroy();
        delete otherPlayers[id];
    }
}

function clearOtherPlayers() {
    Object.keys(otherPlayers).forEach(removeOtherPlayer);
}

/* ------------------------------------------------------------------ */
/*  Game loop                                                          */
/* ------------------------------------------------------------------ */

function update(time) {
    if (!player) return;

    const speed = 150;
    player.setVelocity(0);
    let currentAnim = 'idle-down';

    if (cursors.left.isDown || wasd.A.isDown) {
        player.setVelocityX(-speed);
        currentAnim = 'walk-left';
    } else if (cursors.right.isDown || wasd.D.isDown) {
        player.setVelocityX(speed);
        currentAnim = 'walk-right';
    } else if (cursors.up.isDown || wasd.W.isDown) {
        player.setVelocityY(-speed);
        currentAnim = 'walk-up';
    } else if (cursors.down.isDown || wasd.S.isDown) {
        player.setVelocityY(speed);
        currentAnim = 'walk-down';
    } else {
        const lastAnim = player.anims.currentAnim ? player.anims.currentAnim.key : 'idle-down';
        if (lastAnim.includes('left')) currentAnim = 'idle-left';
        else if (lastAnim.includes('right')) currentAnim = 'idle-right';
        else if (lastAnim.includes('up')) currentAnim = 'idle-up';
        else currentAnim = 'idle-down';
    }

    player.anims.play(currentAnim, true);

    // Send movement only when connected, only when something changed,
    // and at most every SEND_INTERVAL_MS.
    if (socket.connected && time - lastSentAt >= SEND_INTERVAL_MS) {
        const x = Math.round(player.x);
        const y = Math.round(player.y);
        if (x !== lastSent.x || y !== lastSent.y || currentAnim !== lastSent.anim) {
            socket.emit('playerMovement', { x, y, anim: currentAnim });
            lastSent = { x, y, anim: currentAnim };
            lastSentAt = time;
        }
    }

    //y-sorting for depth
    player.setDepth(player.body.bottom);
    updateNameLabel(player);
    Object.values(otherPlayers).forEach(other => {
        if (other.active) {
            other.setDepth(other.y + FOOT_OFFSET);
            updateNameLabel(other);
        }
    });
}