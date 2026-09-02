# 🎧 DJmate - คู่มือการติดตั้งและการใช้งานครั้งแรก (First-Time Setup Guide)

ยินดีต้อนรับสู่ **DJmate - Pro DJ Harmonic Suite**! แอปพลิเคชันสำหรับดาวน์โหลด วิเคราะห์ Harmonic Key (Camelot Wheel), BPM, ความดังเสียง (Auto-Gain Normalization) และจัดเตรียมคลังเพลงสำหรับ Rekordbox / USB

---

## 🍏 สำหรับผู้ใช้งาน macOS (Mac M1/M2/M3/M4 & Intel)

### 1. การติดตั้งและปลดล็อกแอปครั้งแรก
เนื่องจากไฟล์ `.dmg` ดาวน์โหลดจาก GitHub (ยังไม่ได้ซื้อ Apple Developer Certificate $99/ปี) ระบบ macOS Gatekeeper อาจแสดงข้อความเตือนว่า:
> *"DJmate" is damaged and can't be opened. You should move it to the Trash.* (หรือ *แอปเสียหายและไม่สามารถเปิดได้*)

**วิธีปลดล็อก (ทำเพียงครั้งเดียว):**
1. ลาก `DJmate.app` ไปใส่ในโฟลเดอร์ **Applications**
2. เปิดโปรแกรม **Terminal** (กด `Cmd + Space` แล้วพิมพ์ `Terminal`)
3. วางคำสั่งนี้แล้วกด **Enter**:
   ```bash
   xattr -cr /Applications/DJmate.app
   ```
4. เปิดแอป **DJmate** ใช้งานได้ทันที

---

### 2. ติดตั้งโมดูลเครื่องมือดาวน์โหลดเพลง (Python Dependencies)
ระบบดาวน์โหลดและแยกแทร็กของ DJmate ทำงานร่วมกับ Python 3 บนเครื่อง Mac

**วิธีติดตั้ง (ทำครั้งเดียว ใช้เวลา 15 วินาที):**
1. เปิด **Terminal** บน Mac
2. วางคำสั่งนี้แล้วกด **Enter**:
   ```bash
   pip3 install requests yt-dlp mutagen urllib3 pillow numpy imageio-ffmpeg
   ```
   *(💡 หรือติดตั้ง ffmpeg ด้วย Homebrew: `brew install ffmpeg`)*
   *(💡 หาก Mac แจ้งเตือนเรื่อง externally-managed ให้ใส่ flag เพิ่ม: `pip3 install requests yt-dlp mutagen urllib3 pillow numpy imageio-ffmpeg --break-system-packages`)*

---

## 🪟 สำหรับผู้ใช้งาน Windows (Windows 10 / 11)

1. ดับเบิลคลิกเปิดไฟล์ติดตั้ง `DJmate-Setup.exe`
2. หากมีหน้าต่าง **Windows Protected Your PC (SmartScreen)** ปรากฏขึ้น:
   - คลิกที่ข้อความ **"More info (ข้อมูลเพิ่มเติม)"**
   - คลิกปุ่ม **"Run anyway (เรียกใช้ต่อไป)"**
3. ตัวโปรแกรมจะติดตั้งและเปิดใช้งานได้ทันที

---

## ⚙️ การตั้งค่าโฟลเดอร์เก็บเพลง (Settings & Storage)

1. คลิกที่ปุ่ม **⚙️ Settings** (ที่แถบเมนูด้านบน หรือเมนูด้านซ้าย)
2. คลิกปุ่ม **"📂 กดเลือกโฟลเดอร์ได้ทันที"** เพื่อเปิด Finder / Explorer และเลือกโฟลเดอร์ที่ต้องการ
3. หรือกดปุ่มลัด **Quick 1-Click**:
   - `~/Music/DJMate_Music` (โฟลเดอร์เพลงมาตรฐานของ Mac)
   - `downloads` (โฟลเดอร์ภายในโปรเจกต์)
   - `~/Desktop/DJ_Set` (โฟลเดอร์บนหน้าเดสก์ท็อป)
