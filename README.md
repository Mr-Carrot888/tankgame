## รายชื่อสมาชิก
นายปัญญา จันทฆาต     รหัสนักศึกษา 018
นายพงษ์พิสุทธิ์ ต้อยสน   รหัสนักศึกษา 019
นายยจักรกฤษณ์ ปิ่นเมือง  รหัสนักศึกษา 011
นายภูริ มาภู            รหัสนักศึกษา 035
นายศุภกิจ ทองสัมฤทธิ์    รหัสนักศึกษา 027

## การติดตั้ง
python -m venv cg-env

cg-env\Scripts\activate.bat

pip install flask eventlet flask-socketio

## การรันโค้ด
1) รัน server (Python)
```cmd
python server.py

2) ngrok http 5000

3) เปิดเว็บเบราว์เซอร์ ไปที่ `http://localhost:5000`