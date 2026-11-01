//import Phaser from 'phaser';

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d',
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { debug: true }   // set to true to see collision boxes
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
let cursors;
let wasd;

function preload() {
    this.load.spritesheet('player', 'assets/characters/Adventurer.png', {
        frameWidth: 48,
        frameHeight: 48
    });

    this.load.tilemapTiledJSON('map', 'assets/maps/rooms1.json');

    this.load.image('doors', 'assets/maps/room1_assets/doors_windows_stairs.png');
    this.load.image('floors', 'assets/maps/room1_assets/floors.png');
    this.load.image('furniture', 'assets/maps/room1_assets/furniture1.png');
    this.load.image('items', 'assets/maps/room1_assets/items.png');
}

// Find the tileset that owns a global tile id (tile.tileset can be null)
function findTileset(map, gid) {
    return map.tilesets.find(ts =>
        gid >= ts.firstgid &&
        gid < ts.firstgid + ts.total &&
        ts.image                       // only tilesets registered via addTilesetImage
    ) || null;
}

function create() {
    const map = this.make.tilemap({ key: 'map' });

    // First argument = tileset "name" in rooms1.json, second = loaded texture key
    const tilesetDoors     = map.addTilesetImage('doors_stairs', 'doors');
    const tilesetFloors    = map.addTilesetImage('floors', 'floors');
    const tilesetFurniture = map.addTilesetImage('furniture1', 'furniture');
    const tilesetItems     = map.addTilesetImage('items', 'items');

    const allTilesets = [tilesetFloors, tilesetDoors, tilesetFurniture, tilesetItems];
    if (allTilesets.includes(null)) {
        console.warn('A tileset name does not match rooms1.json:', allTilesets.map(t => t && t.name));
    }

    // Layers (furniture/furniture2 are inside a Tiled group, so use indexes 1 and 2)
    const floorLayer      = map.createLayer('floor', allTilesets, 0, 0);
    const wallsLayer      = map.createLayer('walls', allTilesets, 0, 0);
    const furnitureLayer  = map.createLayer(1, allTilesets, 0, 0);
    const furniture2Layer = map.createLayer(2, allTilesets, 0, 0);
    const itemsLayer      = map.createLayer('items', allTilesets, 0, 0);

    // Animations
    const anim = (key, start, end, frameRate) =>
        this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers('player', { start, end }),
            frameRate,
            repeat: -1
        });

    //to me : anim('anim-name',start-frame , end-frame,frame-rate);
    anim('idle-down', 0, 1, 2);
    anim('idle-left', 2, 3, 2);
    anim('idle-right', 4, 5, 2);
    anim('idle-up', 6, 7, 2);

    anim('walk-down', 8, 11, 10);
    anim('walk-left', 12, 15, 10);
    anim('walk-right', 16, 19, 10);
    anim('walk-up', 20, 23, 10);

    //Player
    player = this.physics.add.sprite(200, 200, 'player').setScale(1.5);
    player.setCollideWorldBounds(true);
    player.play('idle-down');
    player.body.setSize(9, 9);
    player.body.setOffset(20, 30);

    // Depths: floor/walls always below, leftover tiles of the sorted layers just above
    // them, converted furniture images get depth = bottom edge of their collision rect.
    const sortLayers = [furnitureLayer, furniture2Layer, itemsLayer];
    floorLayer.setDepth(0);
    wallsLayer.setDepth(0);
    sortLayers.forEach(l => l.setDepth(1));

    // Collisions + tile -> sprite conversion
    const walls = this.physics.add.staticGroup();
    const collisionObjects = map.getObjectLayer('Collisions').objects
        .filter(o => o.width && o.height)          // ignore points / polygons
        .sort((a, b) => a.y - b.y);                // top to bottom so stacked objects don't steal tiles

    // Pixels above the rect that can still belong to the object (tall furniture art)
    const EXTRA_ABOVE = map.tileHeight * 2;

    collisionObjects.forEach(obj => {
        // 1. Physics body (Tiled x/y is top-left, zones are positioned by center)
        const zone = this.add.zone(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
        this.physics.add.existing(zone, true);
        walls.add(zone);

        // 2. Turn the tiles covering this object into depth-sorted images
        const sortDepth = obj.y + obj.height;      // bottom edge of the rect
        const regionY = obj.y - EXTRA_ABOVE;
        const regionH = obj.height + EXTRA_ABOVE;

        sortLayers.forEach(layer => {
            const tiles = layer.getTilesWithinWorldXY(
                obj.x, regionY, obj.width, regionH, { isNotEmpty: true }
            );

            tiles.forEach(tile => {
                const tileset = findTileset(map, tile.index);
                if (!tileset) return;              // leave it in the layer instead of crashing

                const texKey = tileset.image.key;
                const texture = this.textures.get(texKey);
                const frameName = 'tile_' + tile.index;

                // Register a frame for this tile inside the tileset image (once)
                if (!texture.has(frameName)) {
                    const localIndex = tile.index - tileset.firstgid;
                    const col = localIndex % tileset.columns;
                    const row = Math.floor(localIndex / tileset.columns);
                    const fx = tileset.tileMargin + col * (tileset.tileWidth + tileset.tileSpacing);
                    const fy = tileset.tileMargin + row * (tileset.tileHeight + tileset.tileSpacing);
                    texture.add(frameName, 0, fx, fy, tileset.tileWidth, tileset.tileHeight);
                }

                this.add.image(
                    layer.x + tile.pixelX,
                    layer.y + tile.pixelY + tile.height,   // bottom-left of the tile cell
                    texKey,
                    frameName
                )
                    .setOrigin(0, 1)
                    .setFlip(tile.flipX, tile.flipY)
                    .setDepth(sortDepth);

                layer.removeTileAt(tile.x, tile.y);        // stop the layer drawing it too
            });
        });
    });

    // World / camera
    const mapWidth = map.widthInPixels;
    const mapHeight = map.heightInPixels;

    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.startFollow(player);
    this.cameras.main.setZoom(2);

    this.physics.add.collider(player, walls);

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys('W,A,S,D');
}

function update() {
    const speed = 150;
    player.setVelocity(0);

    if (cursors.left.isDown || wasd.A.isDown) {
        player.setVelocityX(-speed);
        player.anims.play('walk-left', true);
    }
    else if (cursors.right.isDown || wasd.D.isDown) {
        player.setVelocityX(speed);
        player.anims.play('walk-right', true);
    }
    else if (cursors.up.isDown || wasd.W.isDown) {
        player.setVelocityY(-speed);
        player.anims.play('walk-up', true);
    }
    else if (cursors.down.isDown || wasd.S.isDown) {
        player.setVelocityY(speed);
        player.anims.play('walk-down', true);
    }
    else {
        const currentAnim = player.anims.currentAnim ? player.anims.currentAnim.key : 'idle-down';
        if (currentAnim.includes('left')) player.anims.play('idle-left', true);
        else if (currentAnim.includes('right')) player.anims.play('idle-right', true);
        else if (currentAnim.includes('up')) player.anims.play('idle-up', true);
        else player.anims.play('idle-down', true);
    }

    // Sort by the player's feet (bottom of the physics body), same reference as the
    // bottom edge of each collision rect
    player.setDepth(player.body.bottom);
}