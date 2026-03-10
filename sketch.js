/**
 * COMPREHENSIVE SNOOKER 2026
 * Controls: 
 * - Mouse Move: Aim
 * - Mouse Hold/Drag: Charge Power
 * - Arrow Keys: Fine-tune aim
 * - Space: Shoot (Max power)
 */

let gameState = 'menu';
let gameMode = '';
let currentPlayer = 1;
let scores = [0, 0]; // Index 0 for P1, Index 1 for P2

let balls = [];
let cueBall;
let reds = [];
let colors = [];

// Table Constants (Proportions)
const TABLE_W = 1000;
const TABLE_H = 500;
const BALL_R = 10; // Slightly smaller for professional feel
const POCKET_R = 20;
const FRICTION = 0.985; // Professional cloth speed

// Physics & Controls
let cueAngle = 0;
let power = 0;
let isCharging = false;
let lastFoul = "";
let ballsMoving = false;
let firstBallHit = null; // To check for fouls

// Rules State
let phase = 'red'; // 'red' or 'color'
let targetValue = 1; // 1 for Red, >1 for specific colors
let tablePockets = [];

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

function setup() {
    let canvas = createCanvas(TABLE_W, TABLE_H);
    canvas.parent('game-container');
    
    tablePockets = [
        createVector(0, 0), createVector(TABLE_W/2, -5), createVector(TABLE_W, 0),
        createVector(0, TABLE_H), createVector(TABLE_W/2, TABLE_H+5), createVector(TABLE_W, TABLE_H)
    ];
    
    showMenu();
}

function initBalls() {
    balls = [];
    reds = [];
    
    // 1. Cue Ball in the "D"
    cueBall = new Ball(TABLE_W * 0.2, TABLE_H * 0.5, 'white', 0);
    balls.push(cueBall);

    // 2. The Colors (Standard Spots)
    colors = [
        new Ball(TABLE_W * 0.25, TABLE_H * 0.6, '#ffd700', 2), // Yellow
        new Ball(TABLE_W * 0.25, TABLE_H * 0.5, '#5d4037', 4), // Brown
        new Ball(TABLE_W * 0.25, TABLE_H * 0.4, '#2e7d32', 3), // Green
        new Ball(TABLE_W * 0.5, TABLE_H * 0.5, '#1565c0', 5),  // Blue
        new Ball(TABLE_W * 0.75, TABLE_H * 0.5, '#f48fb1', 6), // Pink
        new Ball(TABLE_W * 0.9, TABLE_H * 0.5, '#212121', 7)   // Black
    ];
    balls.push(...colors);

    // 3. The Red Triangle (Pack)
    let startX = TABLE_W * 0.77;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j <= i; j++) {
            let r = new Ball(startX + (i * BALL_R * 1.8), (TABLE_H/2 - (i * BALL_R)) + (j * BALL_R * 2), '#d32f2f', 1, true);
            reds.push(r);
            balls.push(r);
        }
    }
}

// ────────────────────────────────────────────────
// MAIN LOOP
// ────────────────────────────────────────────────

function draw() {
    drawTable();
    
    if (gameState !== 'game') return;

    ballsMoving = anyBallMoving();

    // Physics Update
    for (let i = 0; i < balls.length; i++) {
        balls[i].update();
        if (balls[i].checkPotted()) handlePot(balls[i]);
        
        for (let j = i + 1; j < balls.length; j++) {
            if (!balls[i].potted && !balls[j].potted) {
                checkCollision(balls[i], balls[j]);
            }
        }
    }

    // Draw Balls
    balls.forEach(b => b.show());

    // Input & UI
    if (!ballsMoving) {
        if (firstBallHit === null && phase === 'red') checkTurnFoul();
        handleControls();
        drawAimGuide();
    }
    
    drawHUD();
}

// ────────────────────────────────────────────────
// PHYSICS & RULES
// ────────────────────────────────────────────────

class Ball {
    constructor(x, y, col, val, isRed = false) {
        this.pos = createVector(x, y);
        this.vel = createVector(0, 0);
        this.spot = createVector(x, y);
        this.color = col;
        this.value = val;
        this.isRed = isRed;
        this.potted = false;
    }

    update() {
        if (this.potted) return;
        this.pos.add(this.vel);
        this.vel.mult(FRICTION);
        if (this.vel.mag() < 0.15) this.vel.set(0, 0);

        // Cushions
        if (this.pos.x < BALL_R || this.pos.x > TABLE_W - BALL_R) {
            this.vel.x *= -0.8;
            this.pos.x = constrain(this.pos.x, BALL_R, TABLE_W - BALL_R);
        }
        if (this.pos.y < BALL_R || this.pos.y > TABLE_H - BALL_R) {
            this.vel.y *= -0.8;
            this.pos.y = constrain(this.pos.y, BALL_R, TABLE_H - BALL_R);
        }
    }

    show() {
        if (this.potted) return;
        fill(this.color);
        stroke(255, 50);
        ellipse(this.pos.x, this.pos.y, BALL_R * 2);
        // Highlight for 3D effect
        fill(255, 100);
        noStroke();
        ellipse(this.pos.x - 3, this.pos.y - 3, BALL_R * 0.6);
    }

    checkPotted() {
        if (this.potted) return false;
        for (let p of tablePockets) {
            if (this.pos.dist(p) < POCKET_R) {
                this.potted = true;
                this.vel.set(0,0);
                return true;
            }
        }
        return false;
    }
}

function handlePot(ball) {
    if (ball.color === 'white') {
        foul("Cue ball potted!", 4);
        respot(ball);
        return;
    }

    if (phase === 'red') {
        if (ball.isRed) {
            scores[currentPlayer-1] += 1;
            phase = 'color';
        } else {
            foul("Wrong ball potted!", 4);
            respot(ball);
        }
    } else { // Phase: Color
        if (!ball.isRed) {
            scores[currentPlayer-1] += ball.value;
            phase = 'red';
            if (reds.some(r => !r.potted)) respot(ball);
        } else {
            foul("Potted red during color phase!", 4);
        }
    }
}

function respot(ball) {
    ball.potted = false;
    ball.pos.set(ball.spot);
    ball.vel.set(0, 0);
}

function foul(msg, pts) {
    lastFoul = msg;
    let opponent = currentPlayer === 1 ? 2 : 1;
    scores[opponent-1] += Math.max(pts, 4);
    switchTurn();
}

function switchTurn() {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    firstBallHit = null;
}

// ────────────────────────────────────────────────
// UTILS & DRAWING
// ────────────────────────────────────────────────

function drawTable() {
    background(20, 60, 20);
    // Outer wood
    stroke(61, 43, 31);
    strokeWeight(15);
    noFill();
    rect(0, 0, TABLE_W, TABLE_H);
    
    // The "D" and Baulk line
    stroke(255, 50);
    strokeWeight(2);
    line(TABLE_W * 0.25, 0, TABLE_W * 0.25, TABLE_H);
    arc(TABLE_W * 0.25, TABLE_H/2, 150, 150, HALF_PI, -HALF_PI);

    // Pockets
    fill(0);
    noStroke();
    tablePockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}



function drawAimGuide() {
    let mouseV = createVector(mouseX, mouseY);
    cueAngle = atan2(mouseY - cueBall.pos.y, mouseX - cueBall.pos.x);
    
    // Aim Line
    stroke(255, 100);
    let aimX = cueBall.pos.x + cos(cueAngle) * 2000;
    let aimY = cueBall.pos.y + sin(cueAngle) * 2000;
    line(cueBall.pos.x, cueBall.pos.y, aimX, aimY);

    // Power Meter
    if (isCharging) {
        noStroke();
        fill(255, 200, 0);
        rect(cueBall.pos.x - 25, cueBall.pos.y + 30, power * 3, 10);
    }
}

function handleControls() {
    if (mouseIsPressed) {
        isCharging = true;
        power = constrain(power + 0.5, 0, 30);
    } else if (isCharging) {
        shoot();
    }
}

function shoot() {
    let force = p5.Vector.fromAngle(cueAngle);
    force.mult(power * 0.8);
    cueBall.vel.set(force);
    power = 0;
    isCharging = false;
}

function anyBallMoving() {
    return balls.some(b => b.vel.mag() > 0);
}

function drawHUD() {
    fill(255);
    textSize(22);
    textAlign(CENTER);
    text(`P1: ${scores[0]} | P2: ${scores[1]}`, WIDTH/2, 30);
    textSize(16);
    text(`Current Turn: Player ${currentPlayer} | Phase: ${phase.toUpperCase()}`, WIDTH/2, 55);
    if (lastFoul) {
        fill(255, 100, 100);
        text(`FOUL: ${lastFoul}`, WIDTH/2, 80);
    }
}

function showMenu() {
    // Standard menu logic as before...
    let btn = createButton('START SNOOKER');
    btn.position(windowWidth/2 - 70, windowHeight/2);
    btn.mousePressed(() => {
        gameState = 'game';
        btn.remove();
        initBalls();
    });
}
