const socket = io('http://localhost:3000');
let player;
let otherPlayers = {};
let cursors;

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: {
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function create() {
    // 1. Draw a red square for OUR player
    const graphics = this.make.graphics({x: 0, y: 0, add: false});
    graphics.fillStyle(0xff0000, 1); // Red
    graphics.fillRect(0, 0, 30, 30); // 30x30 square
    graphics.generateTexture('player', 30, 30);
    graphics.clear();

    // 2. Draw a blue square for OTHER players
    graphics.fillStyle(0x0000ff, 1); // Blue
    graphics.fillRect(0, 0, 30, 30);
    graphics.generateTexture('other_player', 30, 30);

    // 3. Create your own player
    player = this.physics.add.sprite(400, 300, 'player');
    player.setCollideWorldBounds(true);
    cursors = this.input.keyboard.createCursorKeys();

    // 4. Listen for existing players when we connect
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id !== socket.id) {
                addOtherPlayer(this, players[id]);
            }
        });
    });

    // 5. Listen for new players joining
    socket.on('newPlayer', (playerInfo) => {
        addOtherPlayer(this, playerInfo);
    });

    // 6. Listen for movement from other players
    socket.on('playerMoved', (playerInfo) => {
        if (otherPlayers[playerInfo.id]) {
            otherPlayers[playerInfo.id].x = playerInfo.x;
            otherPlayers[playerInfo.id].y = playerInfo.y;
        }
    });

    // 7. Listen for players leaving
    socket.on('playerDisconnected', (playerId) => {
        if (otherPlayers[playerId]) {
            otherPlayers[playerId].destroy();
            delete otherPlayers[playerId];
        }
    });
}

function addOtherPlayer(scene, playerInfo) {
    otherPlayers[playerInfo.id] = scene.add.sprite(playerInfo.x, playerInfo.y, 'other_player');
}

function update() {
    if (!player) return;

    const speed = 200;
    player.body.setVelocity(0);

    // Listen to BOTH Arrow Keys AND WASD
    const left = cursors.left.isDown || this.input.keyboard.addKey('A').isDown;
    const right = cursors.right.isDown || this.input.keyboard.addKey('D').isDown;
    const up = cursors.up.isDown || this.input.keyboard.addKey('W').isDown;
    const down = cursors.down.isDown || this.input.keyboard.addKey('S').isDown;

    if (left) player.body.setVelocityX(-speed);
    else if (right) player.body.setVelocityX(speed);
    else if (up) player.body.setVelocityY(-speed);
    else if (down) player.body.setVelocityY(speed);

    // Send movement to server only if we are moving
    if (player.body.velocity.x !== 0 || player.body.velocity.y !== 0) {
        socket.emit('playerMovement', { x: player.x, y: player.y });
    }
}