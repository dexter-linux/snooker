/**
 * PRO SNOOKER 2026 - Regulation Scale Edition
 * Scale: 1 inch = 3.5 pixels
 * Table: 144" x 72" (Playing Area)
 */

let balls = [];
let cueBall;
let pockets = [];
let gameState = 'placing'; 
let currentPlayer = 1;
let scores = [0, 0];
let currentBreak = 0;
let phase = 'red'; 

// Regulation Measurements (Converted to pixels)
const SCALE = 3.5; 
const TABLE_W = 144 * SCALE; // 504px
const TABLE_H = 72 * SCALE;  // 252px
const BALL_R = (2.0625 / 2) * SCALE; // ~3.6px (52.4mm diameter)
const POCKET_R = 3.5 * SCALE; 
const BAULK_DIST = 29 * SCALE;
const D_RADIUS = 11.5 * SCALE;
const BLACK_SPOT_DIST = 12.75 * SCALE;

const FRICTION = 0.991; // Fine-tuned for phenolic resin on baize
const ELASTICITY = 0.75;

let cueStick = { angle: 0, power: 0, isCharging: false, maxPower: 30, pullBack: 0 };

function setup() {
  // Adding padding for the wooden rails (60px)
  let canvas = createCanvas(TABLE_W + 120, TABLE_H + 200);
  canvas.parent('game-container');
  
  // Pocket coordinates relative to the green cloth
  let ox = 60; let oy = 60;
  pockets = [
    createVector(ox, oy), createVector(ox + TABLE_W/2, oy - 2), createVector(ox + TABLE_W, oy),
    createVector(ox, oy + TABLE_H), createVector(ox + TABLE_W/2, oy + TABLE_H + 2), createVector(ox + TABLE_W, oy + TABLE_H)
  ];
  
  initGame();
}

function draw() {
  drawTable();
  
  switch(gameState) {
    case 'placing': handlePlacing(); break;
    case 'aiming': updateAiming(); drawTrajectory(); drawCueStick(); break;
    case 'shooting': updateCueAnimation(); drawCueStick(); break;
    case 'moving': updatePhysics(); break;
  }
  
  for (let ball of balls) ball.show();
  drawUI();
}

// ────────────────────────────────────────────────
// REGULATION SETUP (God Bless You Order)
// ────────────────────────────────────────────────

function initGame() {
  balls = [];
  let ox = 60; let oy = 60;
  let midY = oy + TABLE_H/2;
  let baulkX = ox + BAULK_DIST;

  // Cue Ball (Starting in D)
  cueBall = new Ball(baulkX - 20, midY + 20, '#fff', 0, false);
  balls.push(cueBall);

  // The Colors
  // Green (Left), Brown (Middle), Yellow (Right) from baulk end perspective
  balls.push(new Ball(baulkX, midY + D_RADIUS, '#0f0', 3, false)); // Green
  balls.push(new Ball(baulkX, midY, '#842', 4, false));            // Brown
  balls.push(new Ball(baulkX, midY - D_RADIUS, '#ff0', 2, false)); // Yellow
  
  // Blue (Center), Pink (Midway between Blue and Top), Black (Near top)
  balls.push(new Ball(ox + TABLE_W/2, midY, '#00f', 5, false));    // Blue
  let pinkX = ox + TABLE_W * 0.75;
  balls.push(new Ball(pinkX, midY, '#f0f', 6, false));             // Pink
  balls.push(new Ball(ox + TABLE_W - BLACK_SPOT_DIST, midY, '#111', 7, false)); // Black

  // Red Triangle (Behind Pink)
  let startReds = pinkX + (BALL_R * 2) + 2; 
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      let rx = startReds + (i * BALL_R * 1.75);
      let ry = (midY - (i * BALL_R)) + (j * BALL_R * 2);
      balls.push(new Ball(rx, ry, '#f00', 1, true));
    }
  }
}

// ────────────────────────────────────────────────
// LOGIC & CONTROLS
// ────────────────────────────────────────────────

function handlePlacing() {
  let ox = 60; let oy = 60;
  let baulkX = ox + BAULK_DIST;
  let midY = oy + TABLE_H/2;

  if (mouseIsPressed) {
    let d = dist(mouseX, mouseY, baulkX, midY);
    // Constrain to D: x must be <= baulkX and dist from center <= D_RADIUS
    if (d <= D_RADIUS && mouseX <= baulkX) {
      cueBall.pos.set(mouseX, mouseY);
    }
  }
  fill(255);
  textAlign(CENTER);
  text("DRAG BALL IN 'D' • SPACE TO CONFIRM", width/2, height - 120);
}

function keyPressed() {
  if (key === ' ') {
    if (gameState === 'placing') gameState = 'aiming';
    else if (gameState === 'aiming') { cueStick.isCharging = true; }
  }
}

function keyReleased() {
  if (key === ' ' && cueStick.isCharging) {
    cueStick.isCharging = false;
    gameState = 'shooting';
  }
}

// ────────────────────────────────────────────────
// TABLE & UI DRAWING
// ────────────────────────────────────────────────

function drawTable() {
  background(20);
  let ox = 60; let oy = 60;

  // Wood Frame
  fill(60, 30, 10);
  rect(ox - 20, oy - 20, TABLE_W + 40, TABLE_H + 40, 15);
  
  // Cloth (Baize)
  fill(35, 110, 50);
  rect(ox, oy, TABLE_W, TABLE_H);

  // Markings
  stroke(255, 70);
  let baulkX = ox + BAULK_DIST;
  line(baulkX, oy, baulkX, oy + TABLE_H); // Baulk Line
  noFill();
  arc(baulkX, oy + TABLE_H/2, D_RADIUS*2, D_RADIUS*2, HALF_PI, -HALF_PI); // The "D"

  // Pockets
  fill(10);
  noStroke();
  pockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}



function drawUI() {
  fill(255);
  textAlign(CENTER);
  textSize(18);
  text(`PLAYER 1: ${scores[0]}   |   PLAYER 2: ${scores[1]}`, width/2, height - 60);
  textSize(14);
  fill(200);
  text(`PHASE: ${phase.toUpperCase()}  |  BREAK: ${currentBreak}`, width/2, height - 35);
  
  if (cueStick.isCharging) {
    fill(255, 150, 0);
    rect(width/2 - 50, height - 90, map(cueStick.power, 0, cueStick.maxPower, 0, 100), 10);
  }
}

// ────────────────────────────────────────────────
// PHYSICS & CORE (Simplified for clarity)
// ────────────────────────────────────────────────

class Ball {
  constructor(x, y, col, val, isRed) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.initialPos = createVector(x, y);
    this.color = col;
    this.value = val;
    this.isRed = isRed;
    this.potted = false;
  }

  update() {
    if (this.potted) return;
    this.pos.add(this.vel);
    this.vel.mult(FRICTION);
    if (this.vel.mag() < 0.05) this.vel.set(0, 0);

    // Cushion Bounces
    let ox = 60; let oy = 60;
    if (this.pos.x < ox + BALL_R || this.pos.x > ox + TABLE_W - BALL_R) this.vel.x *= -ELASTICITY;
    if (this.pos.y < oy + BALL_R || this.pos.y > oy + TABLE_H - BALL_R) this.vel.y *= -ELASTICITY;
    this.pos.x = constrain(this.pos.x, ox + BALL_R, ox + TABLE_W - BALL_R);
    this.pos.y = constrain(this.pos.y, oy + BALL_R, oy + TABLE_H - BALL_R);
  }

  show() {
    if (this.potted) return;
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
  }

  checkCollision(other) {
    let d = dist(this.pos.x, this.pos.y, other.pos.x, other.pos.y);
    if (d < BALL_R * 2) {
      let n = p5.Vector.sub(this.pos, other.pos).normalize();
      let rv = p5.Vector.sub(this.vel, other.vel);
      let speed = rv.dot(n);
      if (speed < 0) {
        let impulse = n.mult(speed * 1.5);
        this.vel.sub(impulse);
        other.vel.add(impulse);
      }
      // Prevent sticking
      let overlap = BALL_R * 2 - d;
      this.pos.add(p5.Vector.mult(n, overlap/2));
      other.pos.sub(p5.Vector.mult(n, overlap/2));
    }
  }
}

// ... include updateAiming, updateCueAnimation, executeShot, updatePhysics, handlePot, and endShot from previous version ...
