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
		direction: "stop"
	};

	// เก็บ bullets ที่ server ส่งมา (แต่ละ client จะวาด bullets เหมือนกัน)
	let bullets = [];

	// shooting cooldown (ms)
	const SHOOT_COOLDOWN = 500; // 0.5s
	let lastShootTime = 0;

	// ===== สร้าง socket object =====
	// ยังไม่เชื่อมต่อกับ server จนกว่าจะกด connect
	const socket = io("https://d6cc511b6219.ngrok-free.app", { autoConnect: false, transports: ["websocket"] });

function drawCharacter(ctxGame, x, y, angle = 0, color = 'red', SCALE_FACTOR = 0.5) { 
    ctxGame.save();
    ctxGame.translate(x, y); 
    ctxGame.rotate(angle); 

    const headRadius = 25 * SCALE_FACTOR; 
    const skinColor = "#e0b28f";
    const shoulderColor = "#333";
    const gunRotation = -Math.PI / 2; 

    ctxGame.save();
    ctxGame.rotate(gunRotation); 

    const gunW = 40 * SCALE_FACTOR; 
    const gunH = 16 * SCALE_FACTOR;
    const gunLocalX = headRadius + (4 * SCALE_FACTOR); 
    const gunLocalY = -gunH / 2;     

    const barrelW = 22 * SCALE_FACTOR, barrelH = 8 * SCALE_FACTOR; 
    ctxGame.fillStyle = "#333";
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 2 * SCALE_FACTOR; 
    ctxGame.fillRect(gunLocalX, gunLocalY, gunW, gunH); 
    ctxGame.strokeRect(gunLocalX, gunLocalY, gunW, gunH);
    ctxGame.fillRect(gunLocalX + gunW, gunLocalY + (gunH - barrelH)/2, barrelW, barrelH);
    ctxGame.strokeRect(gunLocalX + gunW, gunLocalY + (gunH - barrelH)/2, barrelW, barrelH);

    ctxGame.restore(); 

    // ------------------------------------------ คำนวณตำแหน่ง "มือ" (Hand World Coordinates) ------------------------------------------
    
    // จุดจับบนปืนใน local coordinates ก่อนหมุน
    const gripLow_local_x = gunLocalX + (8 * SCALE_FACTOR);     
    const gripHigh_local_x = gunLocalX + gunW - (8 * SCALE_FACTOR); 
    const gripY_local = gunLocalY + (gunH / 2); 

    // มือขวา (Right Hand) -> จับจุดสูงกว่า
    const handWorldX_R = Math.cos(gunRotation) * gripHigh_local_x - Math.sin(gunRotation) * gripY_local + 3;
    const handWorldY_R = Math.sin(gunRotation) * gripHigh_local_x + Math.cos(gunRotation) * gripY_local - 1;
    
    // มือซ้าย (Left Hand) -> จับจุดต่ำกว่า
    const handWorldX_L = Math.cos(gunRotation) * gripLow_local_x - Math.sin(gunRotation) * gripY_local - 3;
    const handWorldY_L = Math.sin(gunRotation) * gripLow_local_x + Math.cos(gunRotation) * gripY_local;


    // ------------------------------------------ วาดแขนและมือ (Arms and Hands) ------------------------------------------
    
    const armStartX_R = headRadius + (6 * SCALE_FACTOR); 
    const armStartY_R = 10 * SCALE_FACTOR; 
    const armStartX_L = -headRadius - (6 * SCALE_FACTOR); 
    const armStartY_L = 10 * SCALE_FACTOR;

    // Control Points สำหรับเส้นโค้ง
    const cpX_R = headRadius + (30 * SCALE_FACTOR);
    const cpY_R = 10 * SCALE_FACTOR;             
    const cpX_L = -headRadius - (30 * SCALE_FACTOR); 
    const cpY_L = 10 * SCALE_FACTOR;              

    // วาดแขนขวา
    ctxGame.save();
    ctxGame.lineWidth = 6 * SCALE_FACTOR;
    ctxGame.lineCap = "round";
    ctxGame.strokeStyle = skinColor;
    ctxGame.beginPath();
    ctxGame.moveTo(armStartX_R, armStartY_R);
    ctxGame.quadraticCurveTo(cpX_R, cpY_R, handWorldX_R, handWorldY_R);
    ctxGame.stroke();

    // วาดมือขวา
    ctxGame.beginPath();
    ctxGame.fillStyle = skinColor;
    ctxGame.arc(handWorldX_R, handWorldY_R, 6 * SCALE_FACTOR, 0, Math.PI * 2); 
    ctxGame.fill();
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 1 * SCALE_FACTOR; 
    ctxGame.stroke();
    ctxGame.restore();

    // วาดแขนซ้าย
    ctxGame.save();
    ctxGame.lineWidth = 6 * SCALE_FACTOR;
    ctxGame.lineCap = "round";
    ctxGame.strokeStyle = skinColor;
    ctxGame.beginPath();
    ctxGame.moveTo(armStartX_L, armStartY_L);
    ctxGame.quadraticCurveTo(cpX_L, cpY_L, handWorldX_L, handWorldY_L);
    ctxGame.stroke();

    // วาดมือซ้าย
    ctxGame.beginPath();
    ctxGame.fillStyle = skinColor;
    ctxGame.arc(handWorldX_L, handWorldY_L, 6 * SCALE_FACTOR, 0, Math.PI * 2); 
    ctxGame.fill();
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 1 * SCALE_FACTOR;
    ctxGame.stroke();
    ctxGame.restore();


    // ------------------------------------------ หัว, ตา, ไหล่ ------------------------------------------
    
    // หัว
    ctxGame.beginPath();
    ctxGame.fillStyle = color; 
    ctxGame.strokeStyle = "black";
    ctxGame.lineWidth = 3 * SCALE_FACTOR;
    ctxGame.arc(0, 0, headRadius, 0, Math.PI * 2);
    ctxGame.fill();
    ctxGame.stroke();

    // ตา
    ctxGame.fillStyle = "black";
    ctxGame.beginPath(); ctxGame.arc(-8 * SCALE_FACTOR, -8 * SCALE_FACTOR, 3 * SCALE_FACTOR, 0, Math.PI * 2); ctxGame.fill(); 
    ctxGame.beginPath(); ctxGame.arc(8 * SCALE_FACTOR, -8 * SCALE_FACTOR, 3 * SCALE_FACTOR, 0, Math.PI * 2); ctxGame.fill();

    // ไหล่ (Shoulders)
    ctxGame.fillStyle = shoulderColor;
    ctxGame.beginPath(); ctxGame.arc(armStartX_R, armStartY_R, 8 * SCALE_FACTOR, 0, Math.PI * 2); ctxGame.fill(); ctxGame.stroke(); 
    ctxGame.beginPath(); ctxGame.arc(armStartX_L, armStartY_L, 8 * SCALE_FACTOR, 0, Math.PI * 2); ctxGame.fill(); ctxGame.stroke(); 

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

		// ส่งเหตุการณ์ 'shoot' ไปยัง server พร้อมตำแหน่งต้นกำเนิดและสี/owner
		socket.emit('shoot', { x: x, y: y, color: me.color, owner: me.name });
	});

	// ====== Loop การวาดเกม ======
	// ฟังก์ชันสำหรับวาดเกมบน canvas (เรียกซ้ำทุก frame)
	function renderGame() {
		// ลบ canvas ก่อนวาดใหม่
		ctxGame.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

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
				case "Character":
				    drawCharacter(ctxGame, player.pos.x, player.pos.y, player.angle || 0, player.color);	
					break;	
			}
			// วาดชื่อ player ไว้เหนือหัว
			ctxGame.fillStyle = "#000";
			ctxGame.fillText(player.name, player.pos.x - 10 , player.pos.y + 45);
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