/**
 * PRO SNOOKER 2026 
 * Controls: 
 * - Mouse Move: Aim (See Ghost Ball)
 * - Mouse Hold: Charge Power Meter
 * - Release: Shoot
 */

let balls = [];
let cueBall;
let reds = [];
let colors = [];
let pockets = [];
let gameState = 'game';
let currentPlayer = 1;
let scores = [0, 0];

// Physics Constants
const TABLE_W = 1000;
const TABLE_H = 500;
const BALL_R = 10.5;
const POCKET_R = 22;
const FRICTION = 0.985; // Professional cloth drag
const ELASTICITY = 0.9; // Energy kept after bounce

// Interaction State
let cueAngle = 0;
let charge = 0;
let isCharging = false;
let ballsMoving = false;

function setup() {
  let canvas = createCanvas(TABLE_W, TABLE_H);
  canvas.parent('game-container');
  
  pockets = [
    createVector(0, 0), createVector(TABLE_W/2, -5), createVector(TABLE_W, 0),
    createVector(0, TABLE_H), createVector(TABLE_W/2, TABLE_H+5), createVector(TABLE_W, TABLE_H)
  ];
  
  initGame();
}

function draw() {
  drawTableLayout();
  
  ballsMoving = anyBallMoving();
  
  // Physics & Collision Loop
  for (let i = 0; i < balls.length; i++) {
    balls[i].update();
    balls[i].checkPockets();
    
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[i].potted && !balls[j].potted) {
        handleCollision(balls[i], balls[j]);
      }
    }
    balls[i].show();
  }

  if (!ballsMoving) {
    handleAiming();
    drawPowerMeter();
  }
  
  drawUI();
}

// ────────────────────────────────────────────────
// PHYSICS & COLLISION ENGINE
// ────────────────────────────────────────────────

function handleCollision(b1, b2) {
  let distance = p5.Vector.dist(b1.pos, b2.pos);
  let minDistance = BALL_R * 2;

  if (distance < minDistance) {
    // 1. Resolve Overlap (Static Resolution)
    let overlap = minDistance - distance;
    let resolveVec = p5.Vector.sub(b1.pos, b2.pos).normalize().mult(overlap / 2);
    b1.pos.add(resolveVec);
    b2.pos.sub(resolveVec);

    // 2. Resolve Velocity (Elastic Collision)
    let normal = p5.Vector.sub(b2.pos, b1.pos).normalize();
    let relativeVelocity = p5.Vector.sub(b1.vel, b2.vel);
    let speed = relativeVelocity.dot(normal);

    if (speed < 0) return; // Already moving apart

    let impulse = (2 * speed) / 2; // Equal mass balls
    let impulseVec = normal.mult(impulse);

    b1.vel.sub(impulseVec);
    b2.vel.add(impulseVec);
  }
}

// ────────────────────────────────────────────────
// BALL CLASS
// ────────────────────────────────────────────────

class Ball {
  constructor(x, y, col, val, isRed = false) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.color = col;
    this.value = val;
    this.isRed = isRed;
    this.potted = false;
    this.initialPos = createVector(x, y);
  }

  update() {
    if (this.potted) return;
    
    this.pos.add(this.vel);
    this.vel.mult(FRICTION);
    
    if (this.vel.mag() < 0.1) this.vel.set(0, 0);

    // Cushion Bounces
    if (this.pos.x < BALL_R || this.pos.x > TABLE_W - BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = constrain(this.pos.x, BALL_R, TABLE_W - BALL_R);
    }
    if (this.pos.y < BALL_R || this.pos.y > TABLE_H - BALL_R) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = constrain(this.pos.y, BALL_R, TABLE_H - BALL_R);
    }
  }

  show() {
    if (this.potted) return;
    push();
    noStroke();
    // Shadow
    fill(0, 50);
    ellipse(this.pos.x + 2, this.pos.y + 2, BALL_R * 2);
    // Body
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
    // Shine
    fill(255, 120);
    ellipse(this.pos.x - 3, this.pos.y - 3, BALL_R * 0.5);
    pop();
  }

  checkPockets() {
    if (this.potted) return;
    for (let p of pockets) {
      if (this.pos.dist(p) < POCKET_R) {
        this.potted = true;
        this.vel.set(0, 0);
        if (this.color === 'white') respotCueBall();
      }
    }
  }
}

// ────────────────────────────────────────────────
// TABLE & INTERACTION
// ────────────────────────────────────────────────



function drawTableLayout() {
  background(20, 80, 30); // Deep green
  
  // Baulk Line & D
  stroke(255, 100);
  let baulkX = TABLE_W * 0.22;
  line(baulkX, 0, baulkX, TABLE_H);
  noFill();
  arc(baulkX, TABLE_H/2, 160, 160, HALF_PI, -HALF_PI);
  
  // Pockets
  fill(10);
  noStroke();
  pockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}

function handleAiming() {
  cueAngle = atan2(mouseY - cueBall.pos.y, mouseX - cueBall.pos.x);
  
  // Ghost Ball Aiming Line
  stroke(255, 50);
  let aimEnd = p5.Vector.fromAngle(cueAngle).mult(2000).add(cueBall.pos);
  line(cueBall.pos.x, cueBall.pos.y, aimEnd.x, aimEnd.y);
  
  // Ghost Ball Circle (Shows contact point)
  noFill();
  stroke(255, 80);
  ellipse(mouseX, mouseY, BALL_R * 2);

  if (mouseIsPressed) {
    isCharging = true;
    charge = min(charge + 0.3, 25); // Max power cap
  } else if (isCharging) {
    let shot = p5.Vector.fromAngle(cueAngle).mult(charge);
    cueBall.vel.set(shot);
    charge = 0;
    isCharging = false;
  }
}

function drawPowerMeter() {
  if (isCharging) {
    noStroke();
    fill(255, 50, 50, 200);
    rect(20, height - 30, charge * 10, 15, 5);
    fill(255);
    textSize(12);
    text("POWER", 20, height - 35);
  }
}

function drawUI() {
  fill(255);
  noStroke();
  textSize(20);
  textAlign(LEFT);
  text(`Player 1: ${scores[0]}`, 30, 40);
  text(`Player 2: ${scores[1]}`, 30, 70);
  
  if (!ballsMoving) {
    textAlign(CENTER);
    text("HOLD MOUSE TO CHARGE FORCE", width/2, height - 20);
  }
}

function initGame() {
  balls = [];
  // Cue Ball
  cueBall = new Ball(TABLE_W * 0.18, TABLE_H * 0.5, 'white', 0);
  balls.push(cueBall);
  
  // Colors (Professional Spots)
  colors = [
    new Ball(TABLE_W * 0.22, TABLE_H * 0.63, '#ffd700', 2), // Yellow
    new Ball(TABLE_W * 0.22, TABLE_H * 0.5, '#5d4037', 4),  // Brown
    new Ball(TABLE_W * 0.22, TABLE_H * 0.37, '#2e7d32', 3), // Green
    new Ball(TABLE_W * 0.5, TABLE_H * 0.5, '#1565c0', 5),   // Blue
    new Ball(TABLE_W * 0.75, TABLE_H * 0.5, '#f48fb1', 6),  // Pink
    new Ball(TABLE_W * 0.9, TABLE_H * 0.5, '#111111', 7)    // Black
  ];
  balls.push(...colors);
  
  // Reds
  let startX = TABLE_W * 0.77;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      balls.push(new Ball(startX + (i * BALL_R * 1.9), (TABLE_H/2 - (i * BALL_R)) + (j * BALL_R * 2), '#d32f2f', 1, true));
    }
  }
}

function respotCueBall() {
  cueBall.potted = false;
  cueBall.pos.set(TABLE_W * 0.18, TABLE_H * 0.5);
  cueBall.vel.set(0, 0);
}

function anyBallMoving() {
  return balls.some(b => b.vel.magSq() > 0.01);
}
