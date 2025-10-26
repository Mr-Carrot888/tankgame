// import socket.io client (ESM) สำหรับเชื่อมต่อกับ WebSocket server
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';
// import utils (เก็บ key ที่กด) จากไฟล์ utils.js เพื่อใช้ตรวจสอบปุ่มที่ผู้เล่นกด
import { keys } from './utils.js';

// รอให้หน้าเว็บโหลดเสร็จ ก่อนเริ่มทำงาน
document.addEventListener("DOMContentLoaded", function() {

	// ===== อ้างอิง element ในหน้า HTML =====
	// ดึง element ต่างๆจากหน้า HTML มาใช้งาน
	const connectBtn = document.getElementById("connect");         // ปุ่มเชื่อมต่อ server
	const nameInput = document.getElementById("name");             // ช่องกรอกชื่อผู้เล่น
	const joinBtn = document.getElementById("join");               // ปุ่มเข้าร่วมเกม
	const disconnectBtn = document.getElementById("disconnect");   // ปุ่มตัดการเชื่อมต่อ
	const shapeSelect = document.getElementById("shape");          // เลือกรูปร่างตัวละคร
	const gameCanvas = document.getElementById("gameCanvas");      // พื้นที่วาดเกม
	const colorPicker = document.getElementById("color");          // เลือกสีตัวละคร
	const ctxGame = gameCanvas.getContext("2d");                   // context สำหรับวาดบน canvas

	

	// ===== เก็บ state ของเกม =====
	let players = [];  // ผู้เล่นทั้งหมด (server broadcast มาให้ทุกคน)
	let me = {         // ข้อมูล player ของเราเอง
		name: "",
		color: "",
		shape: "",
		pos: { x: 0, y: 0 },
		direction: "stop",
	};

	// เก็บ bullets ที่ server ส่งมา (แต่ละ client จะวาด bullets เหมือนกัน)
	let bullets = [];

	// shooting cooldown (ms)
	const SHOOT_COOLDOWN = 500; // 0.5s
	let lastShootTime = 0;

	// ===== สร้าง socket object =====
	// ยังไม่เชื่อมต่อกับ server จนกว่าจะกด connect

	const socket = io("https://a19725ab0b3f.ngrok-free.app", { autoConnect: false, transports: ["websocket"] })

    // --- ส่วนวาดพื้นหลังและลายหญ้า --- // JV2
    function drawBackground() {
        // วาดพื้นหลังสีเขียวเข้ม
        ctxGame.fillStyle = '#5b8a3b';
        ctxGame.fillRect(0, 0, 800, 600);

        // วาดจุดสีเขียวอ่อนเป็นตาราง (ลายหญ้า)
        ctxGame.fillStyle = '#89c165';
        const dotSpacing = 8;
        const dotSize = 2;
        for (let y = 0; y < 600; y += dotSpacing) {
            for (let x = 0; x < 800; x += dotSpacing) {
                ctxGame.fillRect(x, y, dotSize, dotSize);
            }
        }

        // วาดกำแพงขอบจอ (สีน้ำตาลเข้ม)
        const wallSize = 3;
        ctxGame.fillStyle = '#5c2600ff';
        ctxGame.fillRect(0, 0, 800, wallSize); // บน
        ctxGame.fillRect(0, 600 - wallSize, 800, wallSize); // ล่าง
        ctxGame.fillRect(0, 0, wallSize, 600); // ซ้าย
        ctxGame.fillRect(800 - wallSize, 0, wallSize, 600); // ขวา

        // ตั้งค่าสำหรับวาดกำแพงกำบัง (สีน้ำตาล + ขอบเข้ม)
        ctxGame.fillStyle = '#6b2d04ff';
        ctxGame.strokeStyle = '#401a02';
        ctxGame.lineWidth = 2;

        // วาดกำแพงกำบังทั้งหมด (วาดสี + วาดขอบ)
        // (ตำแหน่งกำแพงตามที่คุณออกแบบ)
        // --- แถวบน ---
        ctxGame.fillRect(90, 0, 10, 150); ctxGame.strokeRect(90, 0, 10, 150);
        ctxGame.fillRect(180, 100, 190, 10); ctxGame.strokeRect(180, 100, 190, 10);
        ctxGame.fillRect(450, 0, 10, 200); ctxGame.strokeRect(450, 0, 10, 200);
        ctxGame.fillRect(600, 120, 200, 10); ctxGame.strokeRect(600, 120, 200, 10);
        ctxGame.fillRect(600, 50, 10, 150); ctxGame.strokeRect(600, 50, 10, 150);
        // --- แถวกลาง ---
        ctxGame.fillRect(150, 280, 250, 10); ctxGame.strokeRect(150, 280, 250, 10);
        ctxGame.fillRect(140, 220, 10, 110); ctxGame.strokeRect(140, 220, 10, 110);
        ctxGame.fillRect(530, 280, 150, 10); ctxGame.strokeRect(530, 280, 150, 10);
        ctxGame.fillRect(530, 200, 10, 110); ctxGame.strokeRect(530, 200, 10, 110);
        ctxGame.fillRect(0, 400, 250, 10); ctxGame.strokeRect(0, 400, 250, 10);
        ctxGame.fillRect(500, 380, 300, 10); ctxGame.strokeRect(500, 380, 300, 10);
        // --- แถวล่าง ---
        ctxGame.fillRect(90, 490, 10, 150); ctxGame.strokeRect(90, 490, 10, 150);
        ctxGame.fillRect(400, 420, 10, 180); ctxGame.strokeRect(400, 420, 10, 180);
        ctxGame.fillRect(650, 470, 10, 130); ctxGame.strokeRect(650, 470, 10, 130);
        ctxGame.fillRect(400, 500, 150, 10); ctxGame.strokeRect(400, 500, 150, 10);
        ctxGame.fillRect(180, 500, 130, 10); ctxGame.strokeRect(180, 500, 130, 10);
    } // JV2

	// วาดตัวละคร
function drawjellyfish(ctxGame, x, y, angle = 0, color = 'purple', SCALE_FACTOR = 0.5) {
    ctxGame.save();
    ctxGame.translate(x, y);
    ctxGame.rotate(angle);

    const headRadius = 25 * SCALE_FACTOR;
    const eyeRadius = 4 * SCALE_FACTOR;
    const tentacleLength = 30 * SCALE_FACTOR;
    const tentacleWidth = 6 * SCALE_FACTOR;

    // --- 1. วาดหัว (วงกลม) ---
    ctxGame.beginPath();
    ctxGame.fillStyle = color;
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 2 * SCALE_FACTOR;
    ctxGame.arc(0, 0, headRadius, 0, Math.PI * 2);
    ctxGame.fill();
    ctxGame.stroke();

    // --- 2. วาดหนวด (tentacles) ด้านล่าง ---
    ctxGame.strokeStyle = color;
    ctxGame.lineWidth = tentacleWidth;
    ctxGame.lineCap = "round";

    const tentacleCount = 5;
    const spacing = 8 * SCALE_FACTOR;
                
    for (let i = -Math.floor(tentacleCount / 2); i <= Math.floor(tentacleCount / 2); i++) {
        const startX = i * spacing;
        const startY = headRadius;
                    
        // จุดควบคุม (เพื่อสร้างส่วนโค้ง)
        // โค้งออกด้านนอกเล็กน้อย 
        const controlX = startX + (i * 5 * SCALE_FACTOR); 
        const controlY = startY + (tentacleLength * 0.5); 
                    
        const endX = startX;
        const endY = startY + tentacleLength;
                    
        ctxGame.beginPath();
        ctxGame.moveTo(startX, startY);
                    
        // ใช้ quadraticCurveTo เพื่อให้หนวดโค้งงอนิดนึง
        ctxGame.quadraticCurveTo(
            controlX, 
            controlY, 
            endX + (i * 2 * SCALE_FACTOR), // ปรับ EndX เล็กน้อยเพื่อให้ดูโค้งมากขึ้น
            endY
        );
        ctxGame.stroke();
    }
                
    // --- 3. วาดตา ---
    ctxGame.fillStyle = "white";
    ctxGame.beginPath(); ctxGame.arc(-8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius, 0, Math.PI * 2); ctxGame.fill();
    ctxGame.beginPath(); ctxGame.arc(8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius, 0, Math.PI * 2); ctxGame.fill();
    ctxGame.fillStyle = "black";
    ctxGame.beginPath(); ctxGame.arc(-8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius / 2, 0, Math.PI * 2); ctxGame.fill();
    ctxGame.beginPath(); ctxGame.arc(8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius / 2, 0, Math.PI * 2); ctxGame.fill();
                
    ctxGame.restore();
}


function drawmouse(ctxGame, x, y, angle = 0, fillColor = 'gray', lineColor = 'black', SCALE_FACTOR = 0.5) {
    ctxGame.save();
    ctxGame.translate(x, y);
    ctxGame.rotate(angle);

    ctxGame.strokeStyle = lineColor;
    ctxGame.lineWidth = 2 * SCALE_FACTOR;
    ctxGame.lineCap = "round";
    ctxGame.lineJoin = "round";

    const headRadius = 25 * SCALE_FACTOR;
    // ขนาดหูใหม่ (เป็นวงรีหรือหยดน้ำที่เรียบง่าย)
    const earWidth = 20 * SCALE_FACTOR;
    const earHeight = 28 * SCALE_FACTOR; // หูสูงกว่ากว้างเล็กน้อย
    const earOffsetFromCenter = 18 * SCALE_FACTOR; // ระยะห่างจากกึ่งกลางหัวไปด้านข้างของหู
    const earOffsetY = -headRadius - earHeight * 0.4; // เลื่อนหูขึ้นไปด้านบนเล็กน้อย

    const eyeRadius = 3 * SCALE_FACTOR;
    const whiskerLength = 20 * SCALE_FACTOR;
    const whiskerSpacing = 5 * SCALE_FACTOR;
    const mouthWidth = 10 * SCALE_FACTOR;
    const whiskerStartX = 8 * SCALE_FACTOR;
    const whiskerStartY = 5 * SCALE_FACTOR;

    // --- 1. วาดหู (อยู่ด้านหลังหัว - ต้องวาดก่อนหัว) ---
    // หูซ้าย (รูปหยดน้ำ/วงรี)
    ctxGame.beginPath();
    // ใช้ ellipse เพื่อวาดวงรี หรือจะใช้ bezierCurveTo เพื่อสร้างรูปหยดน้ำ
    // ตอนนี้จะลองใช้ ellipse ก่อนเพื่อให้เรียบง่ายตามภาพ
    ctxGame.ellipse(
        -earOffsetFromCenter, // ตำแหน่ง X ของจุดศูนย์กลางวงรี
        earOffsetY,           // ตำแหน่ง Y ของจุดศูนย์กลางวงรี
        earWidth / 2,         // รัศมีแกน X
        earHeight / 2,        // รัศมีแกน Y
        0,                    // Rotation (ไม่หมุน)
        0,                    // Start angle
        Math.PI * 2           // End angle
    );
    ctxGame.fillStyle = fillColor;
    ctxGame.fill();
    ctxGame.stroke();

    // หูขวา (รูปหยดน้ำ/วงรี)
    ctxGame.beginPath();
    ctxGame.ellipse(
        earOffsetFromCenter, // ตำแหน่ง X ของจุดศูนย์กลางวงรี
        earOffsetY,          // ตำแหน่ง Y ของจุดศูนย์กลางวงรี
        earWidth / 2,        // รัศมีแกน X
        earHeight / 2,       // รัศมีแกน Y
        0,                   // Rotation
        0,                   // Start angle
        Math.PI * 2          // End angle
    );
    ctxGame.fillStyle = fillColor;
    ctxGame.fill();
    ctxGame.stroke();

    // --- 2. วาดหัว (วงกลม) ---
    ctxGame.beginPath();
    ctxGame.arc(0, 0, headRadius, 0, Math.PI * 2);
    ctxGame.fillStyle = fillColor;
    ctxGame.fill();
    ctxGame.stroke();
    
    // --- 3. วาดตา ---
    ctxGame.fillStyle = lineColor;
    ctxGame.beginPath();
    ctxGame.arc(-8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius, 0, Math.PI * 2);
    ctxGame.fill();
    ctxGame.beginPath();
    ctxGame.arc(8 * SCALE_FACTOR, -8 * SCALE_FACTOR, eyeRadius, 0, Math.PI * 2);
    ctxGame.fill();

    // --- 4. วาดจมูกและปาก ---
    // จมูก (สามเหลี่ยมคว่ำเล็กๆ)
    ctxGame.beginPath();
    ctxGame.moveTo(0, 0);
    ctxGame.lineTo(-4 * SCALE_FACTOR, 6 * SCALE_FACTOR);
    ctxGame.lineTo(4 * SCALE_FACTOR, 6 * SCALE_FACTOR);
    ctxGame.closePath();
    ctxGame.fillStyle = lineColor;
    ctxGame.fill();
    ctxGame.stroke();

    // ปาก (เส้นโค้ง)
    ctxGame.beginPath();
    ctxGame.moveTo(0, 6 * SCALE_FACTOR);
    ctxGame.quadraticCurveTo(-mouthWidth / 2, 12 * SCALE_FACTOR, -headRadius * 0.4, 10 * SCALE_FACTOR);
    ctxGame.stroke();
    ctxGame.beginPath();
    ctxGame.moveTo(0, 6 * SCALE_FACTOR);
    ctxGame.quadraticCurveTo(mouthWidth / 2, 12 * SCALE_FACTOR, headRadius * 0.4, 10 * SCALE_FACTOR);
    ctxGame.stroke();

    // --- 5. วาดหนวด ---
    ctxGame.strokeStyle = lineColor;
    ctxGame.lineWidth = 1.5 * SCALE_FACTOR;

    const yTop = whiskerStartY - (whiskerSpacing / 2);
    const yBottom = whiskerStartY + (whiskerSpacing / 2);

    // หนวดซ้าย (2 เส้น)
    ctxGame.beginPath();
    ctxGame.moveTo(-whiskerStartX, yTop);
    ctxGame.lineTo(-whiskerStartX - whiskerLength -5, yTop);
    ctxGame.stroke();

    ctxGame.beginPath();
    ctxGame.moveTo(-whiskerStartX, yBottom -2);
    ctxGame.lineTo(-whiskerStartX - whiskerLength -5, yBottom + 5);
    ctxGame.stroke();

    // หนวดขวา (2 เส้น)
    ctxGame.beginPath();
    ctxGame.moveTo(whiskerStartX, yTop );
    ctxGame.lineTo(whiskerStartX + whiskerLength + 5, yTop);
    ctxGame.stroke();

    ctxGame.beginPath();
    ctxGame.moveTo(whiskerStartX, yBottom -2 );
    ctxGame.lineTo(whiskerStartX + whiskerLength + 5, yBottom + 5);
    ctxGame.stroke();

    ctxGame.restore();
}

function drawRobot(ctxGame, x, y, angle = 0, color = '#a0a0a0', SCALE_FACTOR = 0.65) {
    ctxGame.save();
    ctxGame.translate(x, y);
    ctxGame.rotate(angle);

    const headSize = 40 * SCALE_FACTOR; // ขนาดหัวสี่เหลี่ยม
    const antennaLength = 20 * SCALE_FACTOR; // ความยาวเสาอากาศ
    const eyeWidth = 12 * SCALE_FACTOR; // ความกว้างตา LED
    const eyeHeight = 6 * SCALE_FACTOR; // ความสูงตา LED
    const mouthWidth = 20 * SCALE_FACTOR; // ความกว้างปาก
    const mouthHeight = 4 * SCALE_FACTOR; // ความสูงปาก

    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 2 * SCALE_FACTOR;
    ctxGame.fillStyle = color;

    // --- 1. Head (หัว) - Square/Box ---
    ctxGame.fillRect(-headSize / 2, -headSize / 2, headSize, headSize);
    ctxGame.strokeRect(-headSize / 2, -headSize / 2, headSize, headSize);

    // --- 2. Antenna (เสาอากาศ) - อยู่ด้านบนหัว ---
    // Line
    ctxGame.beginPath();
    ctxGame.moveTo(0, -headSize / 2); // เริ่มจากกึ่งกลางด้านบนของหัว
    ctxGame.lineTo(0, -headSize / 2 - antennaLength);
    ctxGame.stroke();

    // Bulb
    ctxGame.beginPath();
    ctxGame.arc(0, -headSize / 2 - antennaLength, 4 * SCALE_FACTOR, 0, Math.PI * 2);
    ctxGame.fillStyle = '#ff4444'; // ไฟแดง
    ctxGame.fill();
    ctxGame.stroke();
    
    // --- 3. Eyes (ตา) - LED Style ---
    ctxGame.fillStyle = '#00ff00'; // LED สีเขียว
    // ตาซ้าย
    ctxGame.fillRect(-headSize / 4 - eyeWidth / 2, -headSize / 4 - eyeHeight / 2, eyeWidth, eyeHeight);
    ctxGame.strokeRect(-headSize / 4 - eyeWidth / 2, -headSize / 4 - eyeHeight / 2, eyeWidth, eyeHeight);
    // ตาขวา
    ctxGame.fillRect(headSize / 4 - eyeWidth / 2, -headSize / 4 - eyeHeight / 2, eyeWidth, eyeHeight);
    ctxGame.strokeRect(headSize / 4 - eyeWidth / 2, -headSize / 4 - eyeHeight / 2, eyeWidth, eyeHeight);

    // --- 4. Mouth (ปาก) - Line ---
    ctxGame.beginPath();
    ctxGame.moveTo(-mouthWidth / 2, headSize / 4); // จุดเริ่มต้นปาก
    ctxGame.lineTo(mouthWidth / 2, headSize / 4); // จุดสิ้นสุดปาก
    ctxGame.lineWidth = mouthHeight; // ใช้ความสูงเป็นความหนาของเส้น
    ctxGame.lineCap = "round"; // ให้ปลายเส้นโค้งมน
    ctxGame.strokeStyle = '#444444'; // สีปาก
    ctxGame.stroke();

    ctxGame.restore();
}

function drawMonster(ctxGame, x, y, angle = 0, color = 'darkred', SCALE_FACTOR = 0.35) {
    ctxGame.save();
    ctxGame.translate(x, y);
    ctxGame.rotate(angle);

    const bodyRadius = 35 * SCALE_FACTOR; 
    const hornLength = 40 * SCALE_FACTOR; 
    const hornBaseWidth = 12 * SCALE_FACTOR; 
    const eyeRadius = 15 * SCALE_FACTOR; 
    const pupilRadius = 5 * SCALE_FACTOR;

    // *** ปรับตำแหน่งปาก (ขยับลงมา) ***
    const mouthY = bodyRadius * 0.7; // เปลี่ยนจาก 0.4 เป็น 0.7
    const mouthWidth = bodyRadius * 1.2;

    // *** ปรับตำแหน่งหู (ขยับลงมา) ***
    const earYOffset = bodyRadius * 0.3; // ตำแหน่ง Y ของหู
    const earWidth = 10 * SCALE_FACTOR;
    const earHeight = 20 * SCALE_FACTOR;
    const earXOffset = bodyRadius * 0.9; // ตำแหน่ง X ของหู (ด้านข้าง)
                
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 2 * SCALE_FACTOR;
    ctxGame.lineJoin = "round";
    ctxGame.lineCap = "round";
                
    // --- 1. เขา (Horns) ---
    ctxGame.fillStyle = '#8b4513'; // สีน้ำตาล
                
    // เขาซ้าย
    ctxGame.beginPath();
    ctxGame.moveTo(-bodyRadius * 0.6, -bodyRadius * 0.8); 
    ctxGame.quadraticCurveTo(
        -bodyRadius * 1.5, -bodyRadius * 1.8, 
        -bodyRadius * 0.5, -bodyRadius * 0.8 - hornLength 
    );
    ctxGame.lineTo(-bodyRadius * 0.6 + hornBaseWidth / 2, -bodyRadius * 0.8); 
    ctxGame.closePath();
    ctxGame.fill();
    ctxGame.stroke();

    // เขาขวา
    ctxGame.beginPath();
    ctxGame.moveTo(bodyRadius * 0.6, -bodyRadius * 0.8); 
    ctxGame.quadraticCurveTo(
        bodyRadius * 1.5, -bodyRadius * 1.8, 
        bodyRadius * 0.5, -bodyRadius * 0.8 - hornLength 
    );
    ctxGame.lineTo(bodyRadius * 0.6 - hornBaseWidth / 2, -bodyRadius * 0.8); 
    ctxGame.closePath();
    ctxGame.fill();
    ctxGame.stroke();
                
    // --- 2. ลำตัว/หัว (Body/Head) ---
    ctxGame.beginPath();
    ctxGame.arc(0, 0, bodyRadius, 0, Math.PI * 2);
    ctxGame.fillStyle = color;
    ctxGame.fill();
    ctxGame.stroke();

    // --- 3. ตาเดียว (Cyclops Eye) ---
    // Sclera (ขาว)
    ctxGame.beginPath();
    ctxGame.arc(0, 0, eyeRadius, 0, Math.PI * 2);
    ctxGame.fillStyle = "white";
    ctxGame.fill();
    ctxGame.stroke();

    // Iris (ม่านตา - เขียว)
    ctxGame.beginPath();
    ctxGame.arc(0, 0, eyeRadius * 0.6, 0, Math.PI * 2);
    ctxGame.fillStyle = "lime";
    ctxGame.fill();
                
    // Pupil (รูม่านตา - ดำ)
    ctxGame.beginPath();
    ctxGame.arc(0, 0, pupilRadius, 0, Math.PI * 2);
    ctxGame.fillStyle = "black";
    ctxGame.fill();
                
    // --- 4. ปาก (Mouth) - ฟันแหลม (ใช้ mouthY ใหม่)
    ctxGame.beginPath();
    ctxGame.arc(0, mouthY, mouthWidth / 2, 0, Math.PI, false); // ส่วนโค้งปาก
    ctxGame.fillStyle = "black";
    ctxGame.fill();
                
    // ฟัน
    ctxGame.fillStyle = "white";
    const toothCount = 5;
    const toothBase = mouthWidth / toothCount;
    for (let i = 0; i < toothCount; i++) {
        const tX = -mouthWidth / 2 + (i * toothBase);
        ctxGame.beginPath();
        ctxGame.moveTo(tX, mouthY);
        ctxGame.lineTo(tX + toothBase / 2, mouthY - 8 * SCALE_FACTOR);
        ctxGame.lineTo(tX + toothBase, mouthY);
        ctxGame.fill();
        ctxGame.stroke();
    }

    // --- 5. หู (Ears) - ขยับลงมาอยู่ด้านข้างล่าง ---
    ctxGame.fillStyle = color;
    // หูซ้าย
    ctxGame.beginPath();
    ctxGame.ellipse(
        -earXOffset,
        earYOffset, // ใช้ earYOffset ใหม่
        earWidth,
        earHeight,
        Math.PI / 4, // เอียงเล็กน้อย
        0,
        Math.PI * 2
    );
    ctxGame.fill();
    ctxGame.stroke();

    // หูขวา
    ctxGame.beginPath();
    ctxGame.ellipse(
        earXOffset,
        earYOffset, // ใช้ earYOffset ใหม่
        earWidth,
        earHeight,
        -Math.PI / 4, // เอียงเล็กน้อย
        0,
        Math.PI * 2
    );
    ctxGame.fill();
    ctxGame.stroke();

    ctxGame.restore();
}


	// ===== จัดการ UI ให้เปิด/ปิดตามสถานะการเชื่อมต่อ =====
	// ฟังก์ชันสำหรับปรับสถานะปุ่มต่างๆในหน้าเว็บ
	function UIUpdate(isConnected = false) {
		if (isConnected) {
			// เมื่อเชื่อมต่อแล้ว เปิดปุ่มที่จำเป็น
			connectBtn.disabled = true;
			disconnectBtn.disabled = false;
			joinBtn.disabled = false;
			nameInput.disabled = false;
			shapeSelect.disabled = false;
			colorPicker.disabled = false;
		} else {
			// เมื่อยังไม่เชื่อมต่อ ปิดปุ่มที่ไม่จำเป็น
			connectBtn.disabled = false;
			disconnectBtn.disabled = true;
			joinBtn.disabled = true;
			nameInput.disabled = true;
			shapeSelect.disabled = true;
			colorPicker.disabled = true;
			joinBtn.disabled = true;
		}
	}
	// เมื่อ join เกมแล้ว → ปิดการแก้ไขตัวละคร
	function joinedGame() {
		shapeSelect.disabled = true;
		colorPicker.disabled = true;
		nameInput.disabled = true;
		joinBtn.disabled = true;
	}
	UIUpdate(); // เริ่มแรก = disconnected

	// ====== Socket Events ======
	// เมื่อเชื่อมต่อกับ server สำเร็จ
	socket.on("connect", () => {
		console.log("Connected to WebSocket server");
		UIUpdate(true);
	});

	// เมื่อถูกตัดการเชื่อมต่อจาก server
	socket.on("disconnect", () => {
		console.log("Disconnected from WebSocket server");
		UIUpdate(false);
	});

	// รับข้อความทั่วไปจาก server
	socket.on("message", (data) => {
		console.log("Received message:", data);
	});

	// รับ state ของเกมจาก server ทุก tick (เช่น ตำแหน่งผู้เล่นทั้งหมด)
	socket.on("game_update", (data) => {
		// players = array ของ player objects ที่ server ส่งมา
		players = data.players || [];
		// ถ้า server ส่ง bullets ด้วย ให้เก็บไว้เพื่อวาด
		if (data.bullets) bullets = data.bullets;
	});

	// ====== UI Events ======
	// เมื่อกดปุ่ม connect → เชื่อมต่อกับ server
	connectBtn.addEventListener("click", () => {
		socket.connect();
	});

	// เมื่อกดปุ่ม disconnect → ตัดการเชื่อมต่อกับ server และรีเซ็ตข้อมูลผู้เล่น
	disconnectBtn.addEventListener("click", () => {
		socket.disconnect();
		// reset player ของเรา
		me = { name:"", color:"", shape:"", pos:{x:0,y:0}, direction:"stop" };
	});

	// เมื่อกดปุ่ม join → ส่งข้อมูลตัวละครไป server เพื่อเข้าร่วมเกม
	joinBtn.addEventListener("click", () => {
		const shape = shapeSelect.value;      // รูปร่างที่เลือก
		const color = colorPicker.value;      // สีที่เลือก
		const name = nameInput.value;         // ชื่อที่กรอก
		// สุ่มตำแหน่งเริ่มต้นบน canvas
		const pos = {
			x: Math.random() * gameCanvas.width,
			y: Math.random() * gameCanvas.height 
		};
		if (shape && color && name) {
			// สร้าง object ข้อมูลผู้เล่นของเรา
			me = { name: name, color: color, shape: shape, pos: pos, direction: "stop" };
			socket.emit("join_game", me);  // แจ้ง server ว่าเรา join
			joinedGame();                  // ปิดการแก้ไขตัวละคร
		}
	});

	// ====== Shooting: click on canvas to shoot (cooldown 0.5s) ======
	gameCanvas.addEventListener('click', (e) => {
		// ต้องเป็นผู้เล่นที่ join แล้ว
		if (!me.name) return;
		const now = Date.now();
		if (now - lastShootTime < SHOOT_COOLDOWN) return; // ยัง cooldown
		lastShootTime = now;

		// คำนวณพิกัดสัมพัทธ์กับ canvas
		const rect = gameCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// คำนวณมุมที่ชี้จากผู้เล่นไปยังเป้าหมาย (ในหน่วยเรเดียน)
    	const deltaX = x - me.pos.x;
    	const deltaY = y - me.pos.y;
    	const angle = Math.atan2(deltaY, deltaX);

		// อัปเดตมุมของ player 'me' ทันที (เพื่อให้เห็นการหมุนก่อน Server ตอบกลับ)
    	me.angle = angle;

		// ส่งเหตุการณ์ 'shoot' ไปยัง server พร้อมตำแหน่งต้นกำเนิดและสี/owner
		socket.emit('shoot', { x: x, y: y, color: me.color, owner: me.name, angle: angle });
	});

	// ====== Loop การวาดเกม ======
	// ฟังก์ชันสำหรับวาดเกมบน canvas (เรียกซ้ำทุก frame)
	function renderGame() {
		// ลบ canvas ก่อนวาดใหม่
		ctxGame.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

        drawBackground(); // JV2

		// ตรวจสอบ key กด (จาก utils.js) แล้วส่งทิศทางไป server
		if (keys['W'] || keys['w']) {
			socket.emit("move", { direction: "up" });
		} else if (keys['S'] || keys['s']) {
			socket.emit("move", { direction: "down" });
		} else if (keys['A'] || keys['a']) {
			socket.emit("move", { direction: "left" });
		} else if (keys['D'] || keys['d']) {
			socket.emit("move", { direction: "right" });
		} else {
			socket.emit("move", { direction: "stop" });
		}

		// วาด player แต่ละคนบน canvas
		players.forEach(player => {
			ctxGame.fillStyle = player.color; // กำหนดสีตัวละคร
			switch (player.shape) {
				case "mouse":
				    drawmouse(ctxGame, player.pos.x, player.pos.y, player.angle || 0, player.color);	
					break;	
				case "jellyfish":
				    drawjellyfish(ctxGame, player.pos.x, player.pos.y, player.angle || 0, player.color);	
					break;	
				case "Robot":
				    drawRobot(ctxGame, player.pos.x, player.pos.y, player.angle || 0, player.color);	
					break;	
				case "Monster":
				    drawMonster(ctxGame, player.pos.x, player.pos.y, player.angle || 0, player.color);	
					break;	
			}
			// วาดชื่อ player ไว้เหนือหัว
			ctxGame.fillStyle = "#000";

			ctxGame.textAlign = "center";
			ctxGame.font = "14px Arial";
			ctxGame.fillText(player.name, player.pos.x - 15, player.pos.y - 60);
			ctxGame.fillText(`Score: ${player.score}`, player.pos.x, player.pos.y - 45);

		});

		// วาด bullets
		bullets.forEach(b => {
			ctxGame.fillStyle = b.color || '#000';
			ctxGame.beginPath();
			ctxGame.arc(b.pos.x, b.pos.y, b.radius || 5, 0, Math.PI * 2);
			ctxGame.fill();
		});

		// เรียกตัวเองใหม่ทุก frame (~60fps)
		requestAnimationFrame(renderGame);
	}
	renderGame(); // เริ่ม loop วาดเกม

});