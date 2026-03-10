/**
 * PRO SNOOKER 2026 - Championship Edition (Respotting Fix)
 */

let balls = [];
let cueBall;
let pockets = [];
let gameState = 'placing'; 
let currentPlayer = 1;
let scores = [0, 0];
let currentBreak = 0;
let phase = 'red'; 
let ballsPottedThisShot = [];
let foulCommitted = false;

// Regulation Measurements (3.5px = 1 inch)
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

let snookerSpots = {}; // Renamed to avoid library conflicts
let cueStick = { 
  angle: 0, power: 0, isCharging: false, 
  maxPower: 30, pullBack: 0, animationState: 'idle',
  maxPullBack: 80
};

function setup() {
  // Check if container exists, otherwise default to standard creation
  let canvas = createCanvas(TABLE_W + 120, TABLE_H + 200);
  let container = select('#game-container');
  if (container) {
    canvas.parent('game-container');
  }
  
  let ox = 60; let oy = 60;
  let midY = oy + TABLE_H/2;
  let baulkX = ox + BAULK_DIST;

  // Regulation positions
  snookerSpots = {
    7: createVector(ox + TABLE_W - BLACK_SPOT_DIST, midY), 
    6: createVector(ox + TABLE_W * 0.75, midY),            
    5: createVector(ox + TABLE_W/2, midY),                 
    4: createVector(baulkX, midY),                         
    3: createVector(baulkX, midY + D_RADIUS),              
    2: createVector(baulkX, midY - D_RADIUS)               
  };

  pockets = [
    createVector(ox, oy), createVector(ox + TABLE_W/2, oy - 2), createVector(ox + TABLE_W, oy),
    createVector(ox, oy + TABLE_H), createVector(ox + TABLE_W/2, oy + TABLE_H + 2), createVector(ox + TABLE_W, oy + TABLE_H)
  ];
  
  initGame();
}

function draw() {
  drawTable();
  
  if (gameState === 'placing') handlePlacing();
  else if (gameState === 'aiming') { updateAiming(); drawTrajectory(); drawCueStick(); }
  else if (gameState === 'shooting') { updateCueAnimation(); drawCueStick(); }
  else if (gameState === 'moving') updatePhysics();
  
  for (let b of balls) b.show();
  drawUI();
}

function initGame() {
  balls = [];
  let ox = 60; let midY = 60 + TABLE_H/2;
  let baulkX = ox + BAULK_DIST;

  cueBall = new Ball(baulkX - 30, midY + 20, '#fff', 0, false);
  balls.push(cueBall);

  for (let val in snookerSpots) {
    let col = getBallColor(val);
    balls.push(new Ball(snookerSpots[val].x, snookerSpots[val].y, col, parseInt(val), false));
  }

  let pinkPos = snookerSpots[6];
  let startReds = pinkPos.x + (BALL_R * 2) + 2; 
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      balls.push(new Ball(startReds + (i * BALL_R * 1.85), (midY - (i * BALL_R)) + (j * BALL_R * 2), '#f00', 1, true));
    }
  }
}

// Respotting Logic
function findAvailableSpot(targetBall) {
  let homePos = snookerSpots[targetBall.value];
  if (!isSpotOccupied(homePos)) return homePos;

  let spotOrder = [7, 6, 5, 4, 3, 2];
  for (let val of spotOrder) {
    if (!isSpotOccupied(snookerSpots[val])) return snookerSpots[val];
  }

  let tempPos = homePos.copy();
  while (isSpotOccupied(tempPos)) tempPos.x += 2; 
  return tempPos;
}

function isSpotOccupied(pos) {
  for (let b of balls) {
    if (!b.potted && dist(pos.x, pos.y, b.pos.x, b.pos.y) < BALL_R * 2) return true;
  }
  return false;
}

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
    if (this.vel.mag() < 0.15) this.vel.set(0, 0);

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
    fill(this.color);
    noStroke();
    ellipse(this.pos.x, this.pos.y, BALL_R * 2);
    fill(255, 80);
    ellipse(this.pos.x - 1, this.pos.y - 1, BALL_R * 0.5);
  }

  respot() {
    let s = findAvailableSpot(this);
    this.potted = false;
    this.pos.set(s.x, s.y);
    this.vel.set(0, 0);
  }

  checkCollision(other) {
    let d = dist(this.pos.x, this.pos.y, other.pos.x, other.pos.y);
    if (d < BALL_R * 2) {
      let n = p5.Vector.sub(this.pos, other.pos).normalize();
      let rv = p5.Vector.sub(this.vel, other.vel);
      let speed = rv.dot(n);
      if (speed < 0) {
        let impulse = n.mult(speed * 1.6); // Slightly more bounce
        this.vel.sub(impulse);
        other.vel.add(impulse);
      }
      let overlap = BALL_R * 2 - d;
      this.pos.add(p5.Vector.mult(n, overlap/2));
      other.pos.sub(p5.Vector.mult(n, overlap/2));
    }
  }
}

function updatePhysics() {
  let moving = false;
  for (let b of balls) {
    if (b.potted) continue;
    b.update();
    if (b.vel.mag() > 0) moving = true;
    for (let p of pockets) if (b.pos.dist(p) < POCKET_R) handlePot(b);
    for (let other of balls) if (b !== other && !other.potted) b.checkCollision(other);
  }
  if (!moving) endShot();
}

function handlePlacing() {
  let ox = 60; let baulkX = ox + BAULK_DIST;
  let midY = 60 + TABLE_H/2;
  if (mouseIsPressed) {
    let d = dist(mouseX, mouseY, baulkX, midY);
    if (d <= D_RADIUS && mouseX <= baulkX) cueBall.pos.set(mouseX, mouseY);
  }
}

function keyPressed() {
  if (key === ' ') {
    if (gameState === 'placing') gameState = 'aiming';
    else if (gameState === 'aiming') { cueStick.isCharging = true; cueStick.animationState = 'pulling'; }
  }
}

function keyReleased() {
  if (key === ' ' && cueStick.isCharging) {
    cueStick.isCharging = false;
    cueStick.animationState = 'striking';
    gameState = 'shooting';
  }
}

function updateAiming() {
  cueStick.angle = atan2(mouseY - cueBall.pos.y, mouseX - cueBall.pos.x);
  if (cueStick.isCharging) cueStick.power = constrain(cueStick.power + 0.5, 0, cueStick.maxPower);
}

function updateCueAnimation() {
  if (cueStick.animationState === 'pulling') {
    cueStick.pullBack = lerp(cueStick.pullBack, map(cueStick.power, 0, cueStick.maxPower, 0, cueStick.maxPullBack), 0.2);
  } else if (cueStick.animationState === 'striking') {
    cueStick.pullBack = lerp(cueStick.pullBack, -15, 0.5);
    if (cueStick.pullBack < 0) {
      cueBall.vel.set(p5.Vector.fromAngle(cueStick.angle).mult(cueStick.power));
      cueStick.animationState = 'idle';
      gameState = 'moving';
    }
  }
}

function drawTable() {
  background(40);
  let ox = 60; let oy = 60;
  fill(50, 25, 10); rect(ox-25, oy-25, TABLE_W+50, TABLE_H+50, 12);
  fill(34, 139, 34); rect(ox, oy, TABLE_W, TABLE_H);
  stroke(255, 80); line(ox+BAULK_DIST, oy, ox+BAULK_DIST, oy+TABLE_H);
  noFill(); arc(ox+BAULK_DIST, oy+TABLE_H/2, D_RADIUS*2, D_RADIUS*2, HALF_PI, -HALF_PI);
  fill(0); noStroke(); pockets.forEach(p => ellipse(p.x, p.y, POCKET_R*2));
}

function drawCueStick() {
  push(); translate(cueBall.pos.x, cueBall.pos.y); rotate(cueStick.angle);
  fill(222, 184, 135); rect(-50 - cueStick.pullBack - 220, -3, 220, 6, 2);
  pop();
}

function drawTrajectory() {
  stroke(255, 60); drawingContext.setLineDash([5, 5]);
  line(cueBall.pos.x, cueBall.pos.y, cueBall.pos.x + cos(cueStick.angle)*400, cueBall.pos.y + sin(cueStick.angle)*400);
  drawingContext.setLineDash([]);
}

function drawUI() {
  fill(255); textAlign(CENTER); textSize(18);
  text(`P1: ${scores[0]} | P2: ${scores[1]} | BREAK: ${currentBreak}`, width/2, height - 60);
  if (gameState === 'placing') text("DRAG CUE BALL IN 'D' & PRESS SPACE", width/2, height - 90);
}

function handlePot(ball) {
  ball.potted = true; ball.vel.set(0, 0); ballsPottedThisShot.push(ball);
  let oppIdx = currentPlayer === 1 ? 1 : 0;
  if (ball === cueBall) { foulCommitted = true; scores[oppIdx] += 4; }
  else if (ball.isRed) { scores[currentPlayer-1] += 1; currentBreak++; phase = 'color'; }
  else { 
    scores[currentPlayer-1] += ball.value; currentBreak += ball.value;
    if (balls.some(b => b.isRed && !b.potted)) { setTimeout(() => ball.respot(), 400); phase = 'red'; }
  }
}

function endShot() {
  if (foulCommitted || ballsPottedThisShot.length === 0) { currentPlayer = currentPlayer === 1 ? 2 : 1; currentBreak = 0; phase = 'red'; }
  if (cueBall.potted) { cueBall.potted = false; gameState = 'placing'; } else { gameState = 'aiming'; }
  foulCommitted = false; ballsPottedThisShot = []; cueStick.power = 0;
}

function getBallColor(v) {
  let colors = {7:'#111', 6:'#f0f', 5:'#00f', 4:'#842', 3:'#00ff00', 2:'#ffff00'};
  return colors[v];
}
