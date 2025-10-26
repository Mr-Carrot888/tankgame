# Group Project : Game Onlin

> **เป้าหมาย:** ให้ออกแบบ/ปรับปรุงโค้ดเกมออนไลน์ (เว็บ) ที่มีอยู่แล้ว โดยเพิ่มฟีเจอร์ใหม่ ๆ ที่น่าสนใจ เช่น ระบบคะแนน, ระบบไอเท็ม, การต่อสู้, ระบบผู้เล่นหลายคน ฯลฯ

---

### Template/Sample code

นักศึกษาใช้ template code จาก repository ที่อาจารย์ให้ไว้ ใน repo นี้ และแก้ไขไฟล์หรือเพิ่มไฟล์ตามที่ออกแบบได้เลย

---

## JavaScript Library
- Socket.IO (Client) — https://socket.io/docs/v4/client-initialization/
```JavaScript
import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";
```

## Python Packages
- flask
- eventlet
- flask-socketio
```cmd
python -m venv venv
venv\Scripts\activate.bat    (Windows)
หรือ
venv/bin/activate    (Mac/Linux)

pip install flask eventlet flask-socketio
```
---

## การรันโค้ด
1) รัน server (Python)
```cmd
python server.py
```
2) เปิดเว็บเบราว์เซอร์ ไปที่ `http://localhost:5000`

---

## การใช้ AI
อนุญาตให้ใช้เป็นผู้ช่วยค้นคว้า/ขอคำอธิบาย แต่ **นักศึกษาต้องอธิบายโค้ดของตนเองได้** หากอาจารย์สุ่มถาม (ตอบไม่ได้ มีผลต่อคะแนน “ความเข้าใจโค้ด”)

---

## การส่งงาน
1) สร้าง GitHub repo ชื่อ `comp281-project-ชื่องาน` (เช่น `comp281-project-shooting-online`)
2) อัปโหลดโค้ด + เติม `README.md` (ราชื่อสมาชิกกลุ่ม, การติดตั้ง, วิธีรัน)
3) ส่งลิงก์ GitHub ผ่าน **Google Form** (อาจารย์จะแจ้งลิงก์ในกลุ่ม)
4) นัดหมายนำเสนอผลงาน วันที่ 20 ต.ค. 68 (รายละเอียดจะแจ้งในกลุ่ม) โดยให้แต่ละกลุ่มเตรียมตัวนำเสนอผลงานประมาณ 10-15 นาที ใช้รูปแบบของการนำเสนอได้ตามสะดวก เช่น PowerPoint, Demo โค้ด, วิดีโอ ฯลฯ

---