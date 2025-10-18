# eventlet: ไลบรารีช่วยให้ Flask รองรับ WebSocket + async
import eventlet
# monkey_patch(): ดัดแปลง socket/threading ของ Python → ให้ async ทำงานได้
eventlet.monkey_patch()

from flask import Flask, render_template, request
from flask_socketio import SocketIO

# เก็บ state ของผู้เล่นทั้งหมด (key = sid ของ client)
# players = { sid: { name, color, shape, pos{x,y}, direction } }
players = {}

# ขนาด canvas (เอาไว้ใช้เป็นขอบเขตเกม)
canvasWidth = 800
canvasHeight = 600

# เก็บลูกกระสุน/โปรเจกไทล์บน server
bullets = []  # list ของ { id, owner_sid, pos: {x,y}, vel: {x,y}, color, radius }
_bullet_next_id = 1

# ===== สร้าง Flask app และผูกกับ SocketIO =====
app = Flask(__name__)
socketio = SocketIO(
	app,
	async_mode='eventlet',          # ใช้ eventlet สำหรับ async
	cors_allowed_origins='*'        # เปิดให้ทุกโดเมนเข้าได้ (สะดวกเวลาทดสอบ)
)

# ===== Background game loop =====
# ตัวแปร flag สำหรับเริ่ม loop อัพเดทเกม
is_start_game_update = False
def game_update():
	# tickrate = server update rate (จำนวนครั้งที่อัพเดทต่อวินาที)
	TICK_RATE = 1.0 / 60.0  # 60 updates/sec
	move_speed = 200 * TICK_RATE  # ความเร็วการเคลื่อนที่ของผู้เล่น (pixel/tick)

	while True:
		socketio.sleep(TICK_RATE)  # รอเวลาตาม tickrate
		_players = []
		for sid, player in players.items():
			# อัพเดทตำแหน่งผู้เล่นตาม direction (มีเช็คขอบเขต canvas ด้วย)
			if player['direction'] == 'up' and player['pos']['y'] > 0:
				player['pos']['y'] -= move_speed
			elif player['direction'] == 'down' and player['pos']['y'] < canvasHeight:
				player['pos']['y'] += move_speed
			elif player['direction'] == 'left' and player['pos']['x'] > 0:
				player['pos']['x'] -= move_speed
			elif player['direction'] == 'right' and player['pos']['x'] < canvasWidth:
				player['pos']['x'] += move_speed
			# เพิ่มข้อมูลผู้เล่นลงใน list สำหรับ broadcast
			_players.append(player)

		# อัพเดทตำแหน่ง bullets
		# bullet speed ถูกตั้งเป็น vel (pixel per tick) เมื่อสร้าง
		new_bullets = []
		for b in bullets:
			b['pos']['x'] += b['vel']['x']
			b['pos']['y'] += b['vel']['y']
			# เก็บไว้ถ้ายังอยู่ในขอบเขต canvas
			if 0 <= b['pos']['x'] <= canvasWidth and 0 <= b['pos']['y'] <= canvasHeight:
				new_bullets.append(b)
		# อัพเดท bullets list
		bullets[:] = new_bullets

		# ส่งข้อมูลผู้เล่นและ bullets ไปยังทุก client (broadcast)
		socketio.emit('game_update', { 'players': _players, 'bullets': bullets })

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
	players[request.sid] = {
		'name': data['name'],
		'color': data['color'],
		'shape': data['shape'],
		'pos': { 'x': int(data['pos'].get('x')), 'y': int(data['pos'].get('y')) },
		'direction': data['direction']
	}
	print('Player joined', request.sid, players[request.sid])

# move: อัพเดททิศทางการเคลื่อนที่ของผู้เล่น (รับจาก client)
@socketio.on('move')
def handle_move(data):
	if request.sid in players:
		players[request.sid]['direction'] = data['direction']
		print('Player moved', request.sid, players[request.sid])


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