/**
 * PRO SNOOKER 2026 - Championship Edition
 * Rules: Ball-in-hand in 'D', Red-Color sequence, Foul points.
 */

let balls = [];
let cueBall;
let pockets = [];
let particles = [];
let gameState = 'placing'; // Start in placing mode
let currentPlayer = 1;
let scores = [0, 0];
let currentBreak = 0;
let ballsPottedThisShot = [];
let foulCommitted = false;

// Physics Constants
const TABLE_W = 1200;
const TABLE_H = 600;
const BALL_R = 11;
const POCKET_R = 26;
const FRICTION = 0.99;
const ELASTICITY = 0.8;

// Cue Stick Object
let cueStick = {
  angle: 0, power: 0, isCharging: false, maxPower: 35,
  pullBack: 0, maxPullBack: 100, animationState: 'idle'
};

let redsRemaining = 15;
let phase = 'red'; 
let showTrajectory = true;

function setup() {
  let canvas = createCanvas(TABLE_W + 120, TABLE_H + 220);
  canvas.parent('game-container');
  pockets = [
    createVector(60, 60), createVector(TABLE_W/2 + 60, 55), createVector(TABLE_W + 60, 60),
    createVector(60, TABLE_H + 60), createVector(TABLE_W/2 + 60, TABLE_H + 65), createVector(TABLE_W + 60, TABLE_H + 60)
  ];
  initGame();
}

function draw() {
  drawTable();
  
  switch(gameState) {
    case 'placing':
      handlePlacing();
      break;
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
  drawUI();
  if (cueStick.isCharging) drawPowerMeter();
}

// ────────────────────────────────────────────────
// PLACING LOGIC (BALL IN HAND)
// ────────────────────────────────────────────────

function handlePlacing() {
  let baulkX = 60 + TABLE_W * 0.2;
  let centerY = 60 + TABLE_H / 2;
  let dRadius = 70; // Radius of the "D"

  if (mouseIsPressed) {
    // Check if mouse is inside the "D" arc
    let d = dist(mouseX, mouseY, baulkX, centerY);
    if (d <= dRadius && mouseX <= baulkX) {
      cueBall.pos.set(mouseX, mouseY);
    }
  }
  
  fill(255, 200);
  textAlign(CENTER);
  text("DRAG CUE BALL INTO POSITION • PRESS SPACE TO CONFIRM", width/2, height - 160);
}

// ────────────────────────────────────────────────
// GAME LOGIC & RULES
// ────────────────────────────────────────────────

function handlePot(ball) {
  ball.potted = true;
  ball.vel.set(0, 0);
  ballsPottedThisShot.push(ball);
  
  let opponent = currentPlayer === 1 ? 2 : 1;

  if (ball === cueBall) {
    foulCommitted = true;
    scores[opponent - 1] += 4; // Standard foul points
  } else {
    if (phase === 'red' && ball.isRed) {
      scores[currentPlayer - 1] += 1;
      currentBreak += 1;
      redsRemaining--;
      phase = 'color'; 
    } else if (phase === 'color' && !ball.isRed) {
      scores[currentPlayer - 1] += ball.value;
      currentBreak += ball.value;
      setTimeout(() => ball.respot(), 500);
      phase = 'red';
    } else {
      // Wrong ball potted
      foulCommitted = true;
      scores[opponent - 1] += max(4, ball.value);
    }
  }
}

function endShot() {
  let opponent = currentPlayer === 1 ? 2 : 1;

  if (foulCommitted || ballsPottedThisShot.length === 0) {
    currentPlayer = opponent;
    currentBreak = 0;
    phase = 'red';
  }
  
  if (cueBall.potted) {
    cueBall.potted = false;
    cueBall.vel.set(0, 0);
    gameState = 'placing'; // Back to ball-in-hand
  } else {
    gameState = 'aiming';
  }
  
  foulCommitted = false;
  ballsPottedThisShot = [];
  cueStick.power = 0;
  cueStick.pullBack = 0;
}

// ────────────────────────────────────────────────
// INPUT HANDLING
// ────────────────────────────────────────────────

function keyPressed() {
  if (gameState === 'placing' && key === ' ') {
    gameState = 'aiming';
  }
}

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

// ────────────────────────────────────────────────
// CORE CLASSES & DRAWING
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
    if (this.vel.mag() < 0.1) this.vel.set(0, 0);

    if (this.pos.x < 60 + BALL_R || this.pos.x > TABLE_W + 60 - BALL_R) this.vel.x *= -ELASTICITY;
    if (this.pos.y < 60 + BALL_R || this.pos.y > TABLE_H + 60 - BALL_R) this.vel.y *= -ELASTICITY;
    this.pos.x = constrain(this.pos.x, 60+BALL_R, TABLE_W+60-BALL_R);
    this.pos.y = constrain(this.pos.y, 60+BALL_R, TABLE_H+60-BALL_R);
  }

  show() {
    if (this.potted) return;
    push();
    noStroke();
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
    fill(255, 80);
    ellipse(this.pos.x - 3, this.pos.y - 3, BALL_R * 0.5);
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

function drawTable() {
  background(30);
  fill(101, 67, 33);
  rect(40, 40, TABLE_W + 40, TABLE_H + 40, 10);
  fill(20, 100, 40);
  rect(60, 60, TABLE_W, TABLE_H);
  
  stroke(255, 80);
  let baulkX = 60 + TABLE_W * 0.2;
  line(baulkX, 60, baulkX, 60 + TABLE_H);
  noFill();
  arc(baulkX, 60 + TABLE_H/2, 140, 140, HALF_PI, -HALF_PI);
  
  fill(0);
  pockets.forEach(p => ellipse(p.x, p.y, POCKET_R * 2));
}

function updatePhysics() {
  let moving = false;
  for (let ball of balls) {
    if (ball.potted) continue;
    ball.update();
    if (ball.vel.mag() > 0.1) moving = true;
    for (let p of pockets) if (ball.pos.dist(p) < POCKET_R) handlePot(ball);
    for (let other of balls) if (ball !== other && !other.potted) ball.checkCollision(other);
  }
  if (!moving) endShot();
}

// ... (drawCueStick, drawTrajectory, drawGhostBall, drawPowerMeter, drawUI, updateAiming, updateCueAnimation, executeShot stay the same)

function initGame() {
  balls = [];
  cueBall = new Ball(60 + TABLE_W * 0.18, 60 + TABLE_H * 0.5, '#fff', 0, false);
  balls.push(cueBall);
  
  let bX = 60 + TABLE_W * 0.2;
  balls.push(new Ball(bX, 60 + TABLE_H * 0.62, '#ff0', 2, false)); 
  balls.push(new Ball(bX, 60 + TABLE_H * 0.5, '#842', 4, false));  
  balls.push(new Ball(bX, 60 + TABLE_H * 0.38, '#0f0', 3, false)); 
  balls.push(new Ball(60 + TABLE_W * 0.5, 60 + TABLE_H * 0.5, '#00f', 5, false)); 
  balls.push(new Ball(60 + TABLE_W * 0.75, 60 + TABLE_H * 0.5, '#f0f', 6, false)); 
  balls.push(new Ball(60 + TABLE_W * 0.9, 60 + TABLE_H * 0.5, '#111', 7, false));  
  
  let sX = 60 + TABLE_W * 0.77;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      balls.push(new Ball(sX + (i * BALL_R * 1.9), (60 + TABLE_H/2 - (i * BALL_R)) + (j * BALL_R * 2), '#f00', 1, true));
    }
  }
}
