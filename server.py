# eventlet: ไลบรารีช่วยให้ Flask รองรับ WebSocket + async
import eventlet
# monkey_patch(): ดัดแปลง socket/threading ของ Python → ให้ async ทำงานได้
eventlet.monkey_patch()

import math  #JV2
from flask import Flask, render_template, request
from flask_socketio import SocketIO

import random #JV2

# เก็บ state ของผู้เล่นทั้งหมด (key = sid ของ client)
# players = { sid: { name, color, shape, pos{x,y}, direction } }
players = {}

# ขนาด canvas (เอาไว้ใช้เป็นขอบเขตเกม)
canvasWidth = 800
canvasHeight = 600

# เก็บลูกกระสุน/โปรเจกไทล์บน server
bullets = []  # list ของ { id, owner_sid, pos: {x,y}, vel: {x,y}, color, radius }
_bullet_next_id = 1

#JV2
# <--- 2. เพิ่มรัศมีผู้เล่นและรายการกำแพงทั้งหมด --- 
PLAYER_RADIUS = 20 # รัศมีผู้เล่น (อ้างอิงจากโค้ดเช็คชนกระสุน)

# คัดลอกพิกัดกำแพง (x, y, w, h) จาก drawBackground() ใน index.js
WALLS = [
    # ขอบจอ
    {'x': 0, 'y': 0, 'w': 800, 'h': 3},   # บน
    {'x': 0, 'y': 597, 'w': 800, 'h': 3}, # ล่าง
    {'x': 0, 'y': 0, 'w': 3, 'h': 600},   # ซ้าย
    {'x': 797, 'y': 0, 'w': 3, 'h': 600}, # ขวา

    # --- แถวบน ---
    {'x': 90, 'y': 0, 'w': 10, 'h': 150},
    {'x': 180, 'y': 100, 'w': 190, 'h': 10},
    {'x': 450, 'y': 0, 'w': 10, 'h': 200},
    {'x': 600, 'y': 120, 'w': 200, 'h': 10},
    {'x': 600, 'y': 50, 'w': 10, 'h': 150},
    # --- แถวกลาง ---
    {'x': 150, 'y': 280, 'w': 250, 'h': 10},
    {'x': 140, 'y': 220, 'w': 10, 'h': 110},
    {'x': 530, 'y': 280, 'w': 150, 'h': 10},
    {'x': 530, 'y': 200, 'w': 10, 'h': 110},
    {'x': 0, 'y': 400, 'w': 250, 'h': 10},
    {'x': 500, 'y': 380, 'w': 300, 'h': 10},
    # --- แถวล่าง ---
    {'x': 90, 'y': 490, 'w': 10, 'h': 150},
    {'x': 400, 'y': 420, 'w': 10, 'h': 180},
    {'x': 650, 'y': 470, 'w': 10, 'h': 130},
    {'x': 400, 'y': 500, 'w': 150, 'h': 10},
    {'x': 180, 'y': 500, 'w': 130, 'h': 10},
]

# <--- 3. เพิ่มฟังก์ชันเช็คการชน (AABB-Circle) ---
def check_collision(circle_pos, circle_radius, rect):
    """
    ตรวจสอบการชนระหว่างวงกลม (ผู้เล่น/กระสุน) กับสี่เหลี่ยม (กำแพง)
    """
    # หาจุดที่ใกล้ที่สุดบนสี่เหลี่ยม จากจุดศูนย์กลางวงกลม
    closest_x = max(rect['x'], min(circle_pos['x'], rect['x'] + rect['w']))
    closest_y = max(rect['y'], min(circle_pos['y'], rect['y'] + rect['h']))

    # คำนวณระยะห่างระหว่างจุดที่ใกล้ที่สุด กับจุดศูนย์กลางวงกลม
    dx = circle_pos['x'] - closest_x
    dy = circle_pos['y'] - closest_y
    distance_squared = (dx**2) + (dy**2)

    # ถ้า (ระยะห่าง^2) น้อยกว่า (รัศมี^2) = ชน
    return distance_squared < (circle_radius**2)

# === ฟังก์ชันสุ่มจุดเกิดปลอดภัย ===
def get_safe_spawn_position():
    """สุ่มจุดเกิดที่ไม่ชนกำแพงหรือขอบจอ"""
    while True:
        x = random.randint(50, canvasWidth - 50)
        y = random.randint(50, canvasHeight - 50)
        spawn_pos = {'x': x, 'y': y}

        # ตรวจชนกับกำแพง
        collided = False
        for wall in WALLS:
            if check_collision(spawn_pos, PLAYER_RADIUS, wall):
                collided = True
                break

        # ตรวจห่างจากผู้เล่นอื่น (กันเกิดทับกัน)
        for p in players.values():
            dx = spawn_pos['x'] - p['pos']['x']
            dy = spawn_pos['y'] - p['pos']['y']
            if (dx**2 + dy**2)**0.5 < PLAYER_RADIUS * 3:
                collided = True
                break

        if not collided:
            return spawn_pos
#JV2

# ===== สร้าง Flask app และผูกกับ SocketIO =====
app = Flask(__name__)
socketio = SocketIO(
	app,
	async_mode='eventlet',          # ใช้ eventlet สำหรับ async
	cors_allowed_origins='*'        # เปิดให้ทุกโดเมนเข้าได้ (สะดวกเวลาทดสอบ)
)

# ===== Background game loop =====
is_start_game_update = False

def game_update():
    # tickrate = server update rate (จำนวนครั้งที่อัพเดทต่อวินาที)
    TICK_RATE = 1.0 / 60.0  # 60 updates/sec
    move_speed = 200 * TICK_RATE  # ความเร็วการเคลื่อนที่ของผู้เล่น (pixel/tick)

    while True:
        socketio.sleep(TICK_RATE)  # รอเวลาตาม tickrate

        _players = []

        # ===== อัพเดทตำแหน่งผู้เล่น =====
        for sid, player in list(players.items()):
            next_pos = player['pos'].copy()
            if player['direction'] == 'up':
                next_pos['y'] -= move_speed
            elif player['direction'] == 'down':
                next_pos['y'] += move_speed
            elif player['direction'] == 'left':
                next_pos['x'] -= move_speed
            elif player['direction'] == 'right':
                next_pos['x'] += move_speed

            # ตรวจสอบการชนกำแพง
            is_colliding = False
            if player['direction'] != 'stop':
                for wall in WALLS:
                    if check_collision(next_pos, PLAYER_RADIUS, wall):
                        is_colliding = True
                        break

            if not is_colliding:
                player['pos'] = next_pos

            _players.append(player)

        # ===== อัพเดทตำแหน่ง bullets และตรวจสอบการชนกับผู้เล่น =====
        new_bullets = []
        for b in bullets:
            b['pos']['x'] += b['vel']['x']
            b['pos']['y'] += b['vel']['y']

            hit = False

            # ชนผู้เล่นอื่น
            for sid, player in list(players.items()):
                if sid != b['owner_sid']:
                    dx = b['pos']['x'] - player['pos']['x']
                    dy = b['pos']['y'] - player['pos']['y']
                    distance = (dx**2 + dy**2)**0.5
                    if distance < 20:
                        print(f"Player {sid} ถูกยิงโดย {b['owner_sid']} แล้ว disconnect")

                        owner_sid = b['owner_sid']
                        if owner_sid in players:
                            players[owner_sid]['score'] += 1
                            print(f"Player {owner_sid} ได้ 1 คะแนน! (Score: {players[owner_sid]['score']})")

                        try:
                            socketio.server.disconnect(sid)
                        except Exception as e:
                            print(f"disconnect error for {sid}: {e}")
                        players.pop(sid, None)

                        hit = True
                        break

            if hit:
                continue

            # ชนกำแพง
            for wall in WALLS:
                if check_collision(b['pos'], b['radius'], wall):
                    hit = True
                    break

            if not hit:
                new_bullets.append(b)

        bullets[:] = new_bullets

        # ===== ส่งข้อมูลผู้เล่นและ bullets ไปยังทุก client =====
        socketio.emit('game_update', {'players': _players, 'bullets': bullets})


# ===== Built-in events =====
# connect: เรียกเมื่อ client เชื่อมต่อสำเร็จ
@socketio.on('connect')
def handle_connect():
	output = {
		'message': f'ยินดีต้อนรับสู่ Flask SocketIO server ! from {request.sid} {request.remote_addr}',
		'color': '#000000'
	}
	print('Client connected', request.sid, request.remote_addr)
	socketio.send(output)  # ส่งข้อความไปยัง event "message"

	global is_start_game_update
	# เริ่ม background loop อัพเดทเกมแค่ครั้งเดียว
	if not is_start_game_update:
		is_start_game_update = True
		socketio.start_background_task(game_update)

# message: เรียกเมื่อ client ใช้ socket.send()
@socketio.on('message')
def handle_message(data):
	print('Received message:', data)
	output = {
		'message': f'ข้อความที่ส่งมา: {data["message"]} from {request.sid} {request.remote_addr}',
		'color': data['color']
	}
	socketio.send(output)

# disconnect: เรียกเมื่อ client หลุดการเชื่อมต่อ
@socketio.on('disconnect')
def handle_disconnect():
	# เอาผู้เล่นออกจาก dict เมื่อหลุดการเชื่อมต่อ
	players.pop(request.sid, None)
	print('Client disconnected', request.sid, request.remote_addr)

# ===== Custom events =====
# join_game: ผู้เล่นใหม่เข้ามา (รับข้อมูลตัวละครจาก client)
@socketio.on('join_game')
def handle_join_game(data):
	print(data)
     
	safe_pos = get_safe_spawn_position() #JV2

	players[request.sid] = {
		'name': data['name'],
		'color': data['color'],
		'shape': data['shape'],
		'pos': safe_pos,  # JV2
		'direction': data['direction'],
		'score': 0
	}
	print(f"Player joined {request.sid} at safe spawn {safe_pos}")

# move: อัพเดททิศทางการเคลื่อนที่ของผู้เล่น (รับจาก client)
@socketio.on('move')
def handle_move(data):
	if request.sid in players:
		players[request.sid]['direction'] = data['direction']
# (NEW) angle_update: อัพเดทมุมผู้เล่น (รับจาก client)
@socketio.on('angle_update')
def handle_angle_update(data):
  if request.sid in players and 'angle' in data:
   # อัพเดทมุมของผู้เล่นทันที
   players[request.sid]['angle'] = float(data['angle'])
      # ไม่ต้อง emit ทันที เพราะ game_update loop (60 FPS) จะส่งข้อมูลทั้งหมดไปเอง

# shoot: สร้าง projectile เมื่อผู้เล่นยิง (client จะส่งพิกัดเป้าหมาย)
@socketio.on('shoot')
def handle_shoot(data):
	# data expected: { x, y, color, owner }
	global _bullet_next_id
	# เก็บตำแหน่งต้นทางเป็น pos ของผู้เล่น (ถ้ามี) หรือใช้ pos ที่ client ส่งถ้าไม่มี
	owner_sid = request.sid
	owner = players.get(owner_sid)
	start_x = owner['pos']['x'] if owner else int(data.get('x', 0))
	start_y = owner['pos']['y'] if owner else int(data.get('y', 0))
	# เป้าหมาย (client ส่งพิกัดที่คลิกบน canvas)
	target_x = int(data.get('x', start_x))
	target_y = int(data.get('y', start_y))
	# คำนวณเวกเตอร์ความเร็วให้ความเร็วคงที่
	import math
	angle = math.atan2(target_y - start_y, target_x - start_x)
	speed_pixels_per_tick = 10  # ปรับได้: pixel per tick (tick = game_update loop)
	vel_x = math.cos(angle) * speed_pixels_per_tick
	vel_y = math.sin(angle) * speed_pixels_per_tick
	color = data.get('color', '#000')
	radius = 5
	bullet = {
		'id': _bullet_next_id,
		'owner_sid': owner_sid,
		'pos': { 'x': start_x, 'y': start_y },
		'vel': { 'x': vel_x, 'y': vel_y },
		'color': color,
		'radius': radius
	}
	_bullet_next_id += 1
	bullets.append(bullet)
	print('Bullet spawned', bullet)

# ===== Route ปกติของ Flask =====
@app.route('/')
def index():
	# render หน้า index.html (อยู่ใน templates/)
	return render_template('index.html')

# ===== main program =====
if __name__ == '__main__':
	# ใช้ socketio.run() แทน app.run() เพื่อให้รองรับ WebSocket
	socketio.run(app, host="0.0.0.0", debug=True, port=5000)