/**
 * PRO SNOOKER 2026 - Championship Edition
 * Fixed & Optimized Version
 */

let balls = [];
let cueBall;
let pockets = [];
let particles = [];
let gameState = 'aiming'; 
let currentPlayer = 1;
let scores = [0, 0];
let frameScores = [0, 0];
let currentBreak = 0;
let highestBreak = [0, 0];
let totalPoints = [0, 0];
let ballsPottedThisShot = [];
let foulCommitted = false;
let currentFrame = 1;

let shotStats = {
  player1: { attempts: 0, pots: 0, fouls: 0 },
  player2: { attempts: 0, pots: 0, fouls: 0 }
};

// Physics Constants
const TABLE_W = 1200;
const TABLE_H = 600;
const BALL_R = 11; // Standardized for W:H ratio
const POCKET_R = 26;
const FRICTION = 0.99; // Slightly smoother for 2026 cloth
const ELASTICITY = 0.8;

// Cue Stick Object
let cueStick = {
  angle: 0,
  power: 0,
  isCharging: false,
  maxPower: 35,
  pullBack: 0,
  maxPullBack: 100,
  animationState: 'idle',
  spinOffset: { x: 0, y: 0 }
};

let redsRemaining = 15;
let phase = 'red'; // 'red' or 'color'
let showTrajectory = true;

function setup() {
  let canvas = createCanvas(TABLE_W + 120, TABLE_H + 220);
  canvas.parent('game-container');
  
  // Adjusted Pocket positions for the wood frame padding
  pockets = [
    createVector(60, 60), createVector(TABLE_W/2 + 60, 55), createVector(TABLE_W + 60, 60),
    createVector(60, TABLE_H + 60), createVector(TABLE_W/2 + 60, TABLE_H + 65), createVector(TABLE_W + 60, TABLE_H + 60)
  ];
  
  initGame();
}

function draw() {
  drawTable();
  
  switch(gameState) {
    case 'aiming':
      updateAiming();
      drawTrajectory();
      drawGhostBall();
      drawCueStick();
      break;
    case 'shooting':
      updateCueAnimation();
      drawCueStick();
      break;
    case 'moving':
      updatePhysics();
      break;
  }
  
  for (let ball of balls) ball.show();
  updateParticles();
  drawUI();
  if (cueStick.isCharging) drawPowerMeter();
}

// ────────────────────────────────────────────────
// CUE & AIMING
// ────────────────────────────────────────────────

function updateAiming() {
  let dx = mouseX - cueBall.pos.x;
  let dy = mouseY - cueBall.pos.y;
  cueStick.angle = atan2(dy, dx);
  
  if (cueStick.isCharging) {
    cueStick.power = constrain(cueStick.power + 0.5, 0, cueStick.maxPower);
  }
}

function updateCueAnimation() {
  if (cueStick.animationState === 'pulling') {
    let target = map(cueStick.power, 0, cueStick.maxPower, 0, cueStick.maxPullBack);
    cueStick.pullBack = lerp(cueStick.pullBack, target, 0.2);
  } else if (cueStick.animationState === 'striking') {
    cueStick.pullBack = lerp(cueStick.pullBack, -15, 0.5);
    if (cueStick.pullBack < 2) {
      executeShot();
      cueStick.animationState = 'idle';
      gameState = 'moving';
    }
  }
}

function executeShot() {
  let force = p5.Vector.fromAngle(cueStick.angle).mult(cueStick.power);
  cueBall.vel.set(force);
  shotStats[`player${currentPlayer}`].attempts++;
}

// ────────────────────────────────────────────────
// PHYSICS
// ────────────────────────────────────────────────

function updatePhysics() {
  let moving = false;
  for (let ball of balls) {
    if (ball.potted) continue;
    ball.update();
    if (ball.vel.mag() > 0.1) moving = true;
    
    // Check Pockets
    for (let p of pockets) {
      if (ball.pos.dist(p) < POCKET_R) {
        handlePot(ball);
      }
    }
    
    // Collisions
    for (let other of balls) {
      if (ball !== other && !other.potted) ball.checkCollision(other);
    }
  }
  
  if (!moving) endShot();
}

function handlePot(ball) {
  ball.potted = true;
  ball.vel.set(0, 0);
  ballsPottedThisShot.push(ball);
  
  if (ball === cueBall) {
    foulCommitted = true;
  } else {
    // Scoring logic
    if (phase === 'red' && ball.isRed) {
      scores[currentPlayer - 1] += 1;
      currentBreak += 1;
      redsRemaining--;
      phase = 'color'; 
    } else if (phase === 'color' && !ball.isRed) {
      scores[currentPlayer - 1] += ball.value;
      currentBreak += ball.value;
      if (redsRemaining > 0) {
        setTimeout(() => ball.respot(), 500);
        phase = 'red';
      }
    } else {
      foulCommitted = true;
    }
  }
}

function endShot() {
  if (foulCommitted || ballsPottedThisShot.length === 0) {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    currentBreak = 0;
    phase = 'red';
  }
  
  if (cueBall.potted) cueBall.respot();
  
  foulCommitted = false;
  ballsPottedThisShot = [];
  cueStick.power = 0;
  cueStick.pullBack = 0;
  gameState = 'aiming';
}

// ────────────────────────────────────────────────
// BALL CLASS
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
    
    // Boundary bounce
    if (this.pos.x < 60 + BALL_R || this.pos.x > TABLE_W + 60 - BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = constrain(this.pos.x, 60+BALL_R, TABLE_W+60-BALL_R);
    }
    if (this.pos.y < 60 + BALL_R || this.pos.y > TABLE_H + 60 - BALL_R) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = constrain(this.pos.y, 60+BALL_R, TABLE_H+60-BALL_R);
    }
  }

  show() {
    if (this.potted) return;
    push();
    noStroke();
    fill(0, 40);
    ellipse(this.pos.x + 3, this.pos.y + 3, BALL_R * 2);
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
    fill(255, 100);
    ellipse(this.pos.x - 4, this.pos.y - 4, BALL_R * 0.6);
    pop();
  }

  respot() {
    this.potted = false;
    this.pos.set(this.initialPos.x, this.initialPos.y);
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
    }
  }
}

// ────────────────────────────────────────────────
// DRAWING HELPERS
// ────────────────────────────────────────────────



function drawTable() {
  background(30);
  fill(101, 67, 33);
  rect(40, 40, TABLE_W + 40, TABLE_H + 40, 10);
  fill(20, 100, 40);
  rect(60, 60, TABLE_W, TABLE_H);
  
  // Markings
  stroke(255, 100);
  let baulkX = 60 + TABLE_W * 0.2;
  line(baulkX, 60, baulkX, 60 + TABLE_H);
  noFill();
  arc(baulkX, 60 + TABLE_H/2, 140, 140, HALF_PI, -HALF_PI);
  
  // Pockets
  fill(0);
  pockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}

function drawCueStick() {
  push();
  translate(cueBall.pos.x, cueBall.pos.y);
  rotate(cueStick.angle);
  let d = -60 - cueStick.pullBack;
  fill(222, 184, 135);
  rect(d - 300, -5, 300, 10, 2);
  fill(60, 40, 20);
  rect(d - 300, -6, 80, 12, 3);
  pop();
}

function drawTrajectory() {
  if (!showTrajectory) return;
  stroke(255, 50);
  let end = p5.Vector.fromAngle(cueStick.angle).mult(1000).add(cueBall.pos);
  line(cueBall.pos.x, cueBall.pos.y, end.x, end.y);
}

function drawGhostBall() {
  noFill();
  stroke(255, 100);
  ellipse(mouseX, mouseY, BALL_R * 2);
}

function drawPowerMeter() {
  fill(0, 150);
  rect(width/2 - 100, height - 120, 200, 20, 5);
  fill(255, 100, 0);
  rect(width/2 - 100, height - 120, map(cueStick.power, 0, cueStick.maxPower, 0, 200), 20, 5);
}

function drawUI() {
  fill(255);
  textSize(22);
  textAlign(CENTER);
  text(`PLAYER 1: ${scores[0]} | PLAYER 2: ${scores[1]}`, width/2, height - 60);
  textSize(16);
  text(`BREAK: ${currentBreak} | PHASE: ${phase.toUpperCase()}`, width/2, height - 35);
}

// ────────────────────────────────────────────────
// INPUTS
// ────────────────────────────────────────────────

function mousePressed() {
  if (gameState === 'aiming') {
    cueStick.isCharging = true;
    cueStick.animationState = 'pulling';
  }
}

function mouseReleased() {
  if (cueStick.isCharging) {
    cueStick.isCharging = false;
    cueStick.animationState = 'striking';
    gameState = 'shooting';
  }
}

function initGame() {
  balls = [];
  cueBall = new Ball(60 + TABLE_W * 0.18, 60 + TABLE_H * 0.5, '#fff', 0, false);
  balls.push(cueBall);
  
  // Colors
  let bX = 60 + TABLE_W * 0.2;
  balls.push(new Ball(bX, 60 + TABLE_H * 0.62, '#ff0', 2, false)); // Yellow
  balls.push(new Ball(bX, 60 + TABLE_H * 0.5, '#842', 4, false));  // Brown
  balls.push(new Ball(bX, 60 + TABLE_H * 0.38, '#0f0', 3, false)); // Green
  balls.push(new Ball(60 + TABLE_W * 0.5, 60 + TABLE_H * 0.5, '#00f', 5, false)); // Blue
  balls.push(new Ball(60 + TABLE_W * 0.75, 60 + TABLE_H * 0.5, '#f0f', 6, false)); // Pink
  balls.push(new Ball(60 + TABLE_W * 0.9, 60 + TABLE_H * 0.5, '#111', 7, false));  // Black
  
  // Reds
  let sX = 60 + TABLE_W * 0.77;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      balls.push(new Ball(sX + (i * BALL_R * 1.9), (60 + TABLE_H/2 - (i * BALL_R)) + (j * BALL_R * 2), '#f00', 1, true));
    }
  }
}

// Dummy for particle update to prevent crash
function updateParticles() {}
