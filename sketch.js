/**
 * COMPREHENSIVE SNOOKER 2026
 * Controls: 
 * - Mouse Move: Aim
 * - Mouse Hold/Drag: Charge Power (Yellow bar)
 * - Arrow Keys: Fine-tune aim
 * - Space: Quick Shot (Medium Power)
 */

// ────────────────────────────────────────────────
// GLOBAL STATE
// ────────────────────────────────────────────────
let gameState = 'menu';
let gameMode = 'cpu';
let currentPlayer = 1;
let scores = [0, 0];

let balls = [];
let cueBall;
let reds = [];
let colors = [];
let tablePockets = [];

// Constants
const TABLE_W = 1000;
const TABLE_H = 500;
const BALL_R = 10.5;
const POCKET_R = 22;
const FRICTION = 0.988; // Professional cloth friction

// Control State
let cueAngle = 0;
let power = 0;
let isCharging = false;
let lastFoul = "";
let phase = 'red'; // 'red' or 'color'

// ────────────────────────────────────────────────
// p5.js LIFECYCLE
// ────────────────────────────────────────────────

function setup() {
    let canvas = createCanvas(TABLE_W, TABLE_H);
    canvas.parent('game-container');
    
    // Initialize Pocket Vectors
    tablePockets = [
        createVector(0, 0), createVector(TABLE_W / 2, -5), createVector(TABLE_W, 0),
        createVector(0, TABLE_H), createVector(TABLE_W / 2, TABLE_H + 5), createVector(TABLE_W, TABLE_H)
    ];

    showMenu();
}

function draw() {
    drawTable();

    if (gameState !== 'game') return;

    let moving = anyBallMoving();

    // 1. Physics & Logic Update
    for (let i = 0; i < balls.length; i++) {
        balls[i].update();
        if (balls[i].checkPotted()) handlePot(balls[i]);

        for (let j = i + 1; j < balls.length; j++) {
            if (!balls[i].potted && !balls[j].potted) {
                checkCollision(balls[i], balls[j]);
            }
        }
    }

    // 2. Draw Balls
    balls.forEach(b => b.show());

    // 3. User Controls
    if (!moving) {
        if (currentPlayer === 2 && gameMode === 'cpu') {
            cpuThinkAndShoot();
        } else {
            handleAiming();
            drawCueAndPower();
        }
    }

    drawHUD();
}

// ────────────────────────────────────────────────
// BALL CLASS
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
        
        if (this.vel.mag() < 0.1) this.vel.set(0, 0);

        // Simple Cushion Bounce
        if (this.pos.x < BALL_R || this.pos.x > TABLE_W - BALL_R) {
            this.vel.x *= -0.75;
            this.pos.x = constrain(this.pos.x, BALL_R, TABLE_W - BALL_R);
        }
        if (this.pos.y < BALL_R || this.pos.y > TABLE_H - BALL_R) {
            this.vel.y *= -0.75;
            this.pos.y = constrain(this.pos.y, BALL_R, TABLE_H - BALL_R);
        }
    }

    show() {
        if (this.potted) return;
        
        // Shadow
        fill(0, 50);
        noStroke();
        ellipse(this.pos.x + 2, this.pos.y + 2, BALL_R * 2);

        // Ball Body
        fill(this.color);
        stroke(255, 30);
        strokeWeight(1);
        ellipse(this.pos.x, this.pos.y, BALL_R * 2);

        // Reflection/Shine
        fill(255, 100);
        noStroke();
        ellipse(this.pos.x - BALL_R * 0.3, this.pos.y - BALL_R * 0.3, BALL_R * 0.6);
    }

    checkPotted() {
        if (this.potted) return false;
        for (let p of tablePockets) {
            if (this.pos.dist(p) < POCKET_R) {
                this.potted = true;
                this.vel.set(0, 0);
                return true;
            }
        }
        return false;
    }
}

// ────────────────────────────────────────────────
// GAME ENGINE LOGIC
// ────────────────────────────────────────────────

function drawTable() {
    background(15, 75, 25); // Deep green cloth
    
    // Baulk Line & "D"
    stroke(255, 80);
    strokeWeight(2);
    let baulkX = TABLE_W * 0.2;
    line(baulkX, 0, baulkX, TABLE_H);
    noFill();
    arc(baulkX, TABLE_H / 2, 160, 160, HALF_PI, -HALF_PI);

    
    // Pockets
    fill(10);
    noStroke();
    tablePockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}

function initBalls() {
    balls = [];
    reds = [];
    scores = [0, 0];
    phase = 'red';

    // Cue Ball
    cueBall = new Ball(TABLE_W * 0.15, TABLE_H * 0.55, 'white', 0);
    balls.push(cueBall);

    // Colors on precise Spots
    let baulkX = TABLE_W * 0.2;
    colors = [
        new Ball(baulkX, TABLE_H * 0.66, '#f1c40f', 2), // Yellow
        new Ball(baulkX, TABLE_H * 0.5, '#795548', 4),   // Brown
        new Ball(baulkX, TABLE_H * 0.33, '#27ae60', 3), // Green
        new Ball(TABLE_W * 0.5, TABLE_H * 0.5, '#2980b9', 5), // Blue
        new Ball(TABLE_W * 0.74, TABLE_H * 0.5, '#f06292', 6), // Pink
        new Ball(TABLE_W * 0.92, TABLE_H * 0.5, '#1a1a1a', 7)  // Black
    ];
    balls.push(...colors);

    // Red Pack (Pyramid)
    let startX = TABLE_W * 0.75;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j <= i; j++) {
            let r = new Ball(startX + (i * BALL_R * 1.85), (TABLE_H / 2 - (i * BALL_R)) + (j * BALL_R * 2), '#c0392b', 1, true);
            reds.push(r);
            balls.push(r);
        }
    }
}

function handlePot(ball) {
    if (ball === cueBall) {
        lastFoul = "In-Off (Cue Ball Potted)";
        scores[currentPlayer === 1 ? 1 : 0] += 4;
        respot(ball);
        switchTurn();
        return;
    }

    if (phase === 'red') {
        if (ball.isRed) {
            scores[currentPlayer - 1] += 1;
            phase = 'color';
        } else {
            foul("Hit color when red was required", 4);
            respot(ball);
        }
    } else {
        if (!ball.isRed) {
            scores[currentPlayer - 1] += ball.value;
            phase = 'red';
            if (reds.some(r => !r.potted)) respot(ball);
        } else {
            foul("Hit red when color was required", 4);
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
    scores[currentPlayer === 1 ? 1 : 0] += pts;
    switchTurn();
}

function switchTurn() {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
}

// ────────────────────────────────────────────────
// CONTROLS & PHYSICS
// ────────────────────────────────────────────────

function handleAiming() {
    cueAngle = atan2(mouseY - cueBall.pos.y, mouseX - cueBall.pos.x);
    
    if (mouseIsPressed) {
        isCharging = true;
        power = constrain(power + 0.4, 0, 25);
    } else if (isCharging) {
        shoot();
    }
}

function drawCueAndPower() {
    // Aim Line
    stroke(255, 50);
    let aimX = cueBall.pos.x + cos(cueAngle) * 1000;
    let aimY = cueBall.pos.y + sin(cueAngle) * 1000;
    line(cueBall.pos.x, cueBall.pos.y, aimX, aimY);

    // Power Bar
    if (isCharging) {
        noStroke();
        fill(255, 200, 0);
        rect(cueBall.pos.x - 20, cueBall.pos.y + 30, power * 2, 8);
    }
}

function shoot() {
    let force = p5.Vector.fromAngle(cueAngle);
    force.mult(power);
    cueBall.vel.set(force);
    power = 0;
    isCharging = false;
    lastFoul = "";
}

function checkCollision(b1, b2) {
    let d = dist(b1.pos.x, b1.pos.y, b2.pos.x, b2.pos.y);
    if (d >= BALL_R * 2) return;

    let n = p5.Vector.sub(b2.pos, b1.pos).normalize();
    let rv = p5.Vector.sub(b1.vel, b2.vel);
    let velNormal = rv.dot(n);

    if (velNormal > 0) return;

    let impulse = -1.8 * velNormal / 2;
    b1.vel.sub(p5.Vector.mult(n, impulse));
    b2.vel.add(p5.Vector.mult(n, impulse));

    // Resolve overlap
    let overlap = (BALL_R * 2) - d;
    b1.pos.sub(p5.Vector.mult(n, overlap * 0.5));
    b2.pos.add(p5.Vector.mult(n, overlap * 0.5));
}

function anyBallMoving() {
    return balls.some(b => b.vel.mag() > 0);
}

function drawHUD() {
    fill(255);
    noStroke();
    textAlign(LEFT);
    textSize(20);
    text(`Player 1: ${scores[0]}`, 20, 30);
    text(`Player ${gameMode === 'cpu' ? 'CPU' : '2'}: ${scores[1]}`, 20, 55);
    
    textAlign(CENTER);
    text(`PHASE: ${phase.toUpperCase()}`, WIDTH/2, 30);
    if (lastFoul) {
        fill(255, 100, 100);
        text(lastFoul, WIDTH/2, 60);
    }
}

function showMenu() {
    let btn = createButton('START SNOOKER');
    btn.class('menu-btn'); // Link to your CSS
    btn.position(windowWidth / 2 - 70, windowHeight / 2);
    btn.mousePressed(() => {
        btn.remove();
        gameState = 'game';
        initBalls();
    });
}

function cpuThinkAndShoot() {
    setTimeout(() => {
        cueAngle = random(TWO_PI);
        power = random(5, 15);
        shoot();
    }, 1500);
}
