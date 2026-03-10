/**
 * PRO SNOOKER 2026 - Championship Edition
 * Added: Intelligent Respotting Logic (Highest available spot)
 */

let balls = [];
let cueBall;
let pockets = [];
let gameState = 'placing'; 
let currentPlayer = 1;
let scores = [0, 0];
let currentBreak = 0;
let phase = 'red'; 

// Regulation Measurements (Pixels)
const SCALE = 3.5; 
const TABLE_W = 144 * SCALE; 
const TABLE_H = 72 * SCALE;  
const BALL_R = (2.0625 / 2) * SCALE; 
const POCKET_R = 3.5 * SCALE; 
const BAULK_DIST = 29 * SCALE;
const D_RADIUS = 11.5 * SCALE;
const BLACK_SPOT_DIST = 12.75 * SCALE;

const FRICTION = 0.991; 
const ELASTICITY = 0.75;

let spots = {}; // To store the coordinates of each color's home
let cueStick = { angle: 0, power: 0, isCharging: false, maxPower: 30, pullBack: 0, animationState: 'idle' };

function setup() {
  let canvas = createCanvas(TABLE_W + 120, TABLE_H + 200);
  canvas.parent('game-container');
  
  let ox = 60; let oy = 60;
  let midY = oy + TABLE_H/2;
  let baulkX = ox + BAULK_DIST;

  // Define Home Spots for respotting logic
  spots = {
    7: createVector(ox + TABLE_W - BLACK_SPOT_DIST, midY), // Black
    6: createVector(ox + TABLE_W * 0.75, midY),            // Pink
    5: createVector(ox + TABLE_W/2, midY),                 // Blue
    4: createVector(baulkX, midY),                         // Brown
    3: createVector(baulkX, midY + D_RADIUS),              // Green
    2: createVector(baulkX, midY - D_RADIUS)               // Yellow
  };

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
// INTELLIGENT RESPOTTING
// ────────────────────────────────────────────────

function findAvailableSpot(targetBall) {
  // 1. Try its own spot first
  let homePos = spots[targetBall.value];
  if (!isSpotOccupied(homePos)) return homePos;

  // 2. Try other spots in order: Black (7) down to Yellow (2)
  let spotOrder = [7, 6, 5, 4, 3, 2];
  for (let val of spotOrder) {
    let altPos = spots[val];
    if (!isSpotOccupied(altPos)) return altPos;
  }

  // 3. If all spots full, place as close as possible to home toward top cushion
  let tempPos = homePos.copy();
  while (isSpotOccupied(tempPos)) {
    tempPos.x += 1; // Move slightly toward top cushion
  }
  return tempPos;
}

function isSpotOccupied(pos) {
  for (let b of balls) {
    if (!b.potted && dist(pos.x, pos.y, b.pos.x, b.pos.y) < BALL_R * 2) {
      return true;
    }
  }
  return false;
}

// ────────────────────────────────────────────────
// BALL CLASS & PHYSICS
// ────────────────────────────────────────────────

class Ball {
  constructor(x, y, col, val, isRed) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
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

    let ox = 60; let oy = 60;
    if (this.pos.x < ox + BALL_R || this.pos.x > ox + TABLE_W - BALL_R) {
        this.vel.x *= -ELASTICITY;
        this.pos.x = constrain(this.pos.x, ox + BALL_R, ox + TABLE_W - BALL_R);
    }
    if (this.pos.y < oy + BALL_R || this.pos.y > oy + TABLE_H - BALL_R) {
        this.vel.y *= -ELASTICITY;
        this.pos.y = constrain(this.pos.y, oy + BALL_R, oy + TABLE_H - BALL_R);
    }
  }

  show() {
    if (this.potted) return;
    push();
    noStroke();
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
    fill(255, 100);
    ellipse(this.pos.x - 2, this.pos.y - 2, BALL_R * 0.5);
    pop();
  }

  respot() {
    let finalSpot = findAvailableSpot(this);
    this.potted = false;
    this.pos.set(finalSpot.x, finalSpot.y);
    this.vel.set(0, 0);
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
      let overlap = BALL_R * 2 - d;
      this.pos.add(p5.Vector.mult(n, overlap/2));
      other.pos.sub(p5.Vector.mult(n, overlap/2));
    }
  }
}

// ────────────────────────────────────────────────
// GAME ENGINE UPDATES
// ────────────────────────────────────────────────

function handlePot(ball) {
  ball.potted = true;
  ball.vel.set(0, 0);
  
  let opponent = currentPlayer === 1 ? 2 : 1;

  if (ball === cueBall) {
    scores[opponent - 1] += 4;
    // Handled in endShot for gameState change
  } else {
    if (phase === 'red' && ball.isRed) {
      scores[currentPlayer - 1] += 1;
      currentBreak += 1;
      phase = 'color'; 
    } else if (phase === 'color' && !ball.isRed) {
      scores[currentPlayer - 1] += ball.value;
      currentBreak += ball.value;
      // Respot immediately if Reds are still on the table
      let redsStillOn = balls.some(b => b.isRed && !b.potted);
      if (redsStillOn) {
         setTimeout(() => ball.respot(), 300);
         phase = 'red';
      }
    } else {
      scores[opponent - 1] += max(4, ball.value);
    }
  }
}

// ... include drawTable, handlePlacing, updateAiming, executeShot, endShot from the Spacebar version ...

function initGame() {
  balls = [];
  let ox = 60; let oy = 60;
  let midY = oy + TABLE_H/2;
  let baulkX = ox + BAULK_DIST;

  cueBall = new Ball(baulkX - 30, midY + 10, '#fff', 0, false);
  balls.push(cueBall);

  // Initialize from the spots object defined in setup()
  for (let val in spots) {
    let col = val == 7 ? '#111' : val == 6 ? '#f0f' : val == 5 ? '#00f' : val == 4 ? '#842' : val == 3 ? '#0f0' : '#ff0';
    balls.push(new Ball(spots[val].x, spots[val].y, col, parseInt(val), false));
  }

  // Reds
  let pinkPos = spots[6];
  let startReds = pinkPos.x + (BALL_R * 2) + 2; 
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      balls.push(new Ball(startReds + (i * BALL_R * 1.8), (midY - (i * BALL_R)) + (j * BALL_R * 2), '#f00', 1, true));
    }
  }
}
