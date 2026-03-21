const express = require('express');
const schedule = require('node-schedule');
const puppeteer = require('puppeteer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Tự tạo modulo uploads 
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './uploads'); },
    filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

//  1 giao diện web
app.get('/', (req, res) => {
    res.send(`
        <html lang="vi">
        <head><meta charset="UTF-8"><title>Bot Facebook </title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #f0f2f5;">
            <div style="max-width: 600px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="color: #1877f2;">🤖 Tool </h2>
                <form action="/dat-lich" method="POST" enctype="multipart/form-data">
                    <label><b>1. Link các nhóm (Mỗi dòng 1 link):</b></label><br>
                    <textarea name="links" rows="3" style="width: 100%; margin-top: 8px;" required></textarea><br><br>

                    <label><b>2. Tiêu đề bài viết (Nếu nhóm có yêu cầu):</b></label><br>
                    <input type="text" name="tieude" style="width: 100%; padding: 8px; margin-top: 8px;"><br><br>

                    <label><b>3. Nội dung chi tiết:</b></label><br>
                    <textarea name="noidung" rows="4" style="width: 100%; margin-top: 8px;" required></textarea><br><br>

                    <label><b>4. Chọn ảnh (Tùy chọn):</b></label><br>
                    <input type="file" name="hinhanh" accept="image/*" style="padding: 5px;"><br><br>

                    <label><b>5. Giờ tự động đăng (VD: 14:30):</b></label><br>
                    <input type="time" name="thoigian" style="padding: 5px;" required><br><br>

                    <button type="submit" style="padding: 10px 20px; font-size: 16px; background: #1877f2; color: white; border: none; border-radius: 6px; cursor: pointer;">🚀 Hẹn giờ chạy</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// ================= 2. XỬ LÝ DỮ LIỆU =================
app.post('/dat-lich', upload.single('hinhanh'), (req, res) => {
    const rawLinks = req.body.links;
    const tieuDe = req.body.tieude || '';
    const noiDung = req.body.noidung;
    const thoiGian = req.body.thoigian; 
    const duongDanAnh = req.file ? path.resolve(req.file.path) : null;

    const danhSachNhom = rawLinks.split('\n').map(link => link.trim()).filter(link => link !== '');
    const [gio, phut] = thoiGian.split(':');

    console.log(`\n================================`);
    console.log(`✅ Lệnh đã nhận! Hẹn giờ chạy lúc ${thoiGian}`);
    console.log(`================================\n`);

    schedule.scheduleJob(`${phut} ${gio} * * *`, function() {
        console.log(`⏰ ĐÃ ĐẾN GIỜ! BẮT ĐẦU CHẠY...`);
        chayBotPuppeteer(danhSachNhom, tieuDe, noiDung, duongDanAnh);
    });

    res.send(`
        <h2 style="color: green; font-family: Arial;">✅ Đã lên lịch thành công!</h2>
        <p style="font-family: Arial;">Cứ để nguyên cửa sổ cmd màu đen, tới giờ bot sẽ tự chạy.</p>
        <button onclick="window.location.href='/'">Quay lại form</button>
    `);
});

// 3. LOGIC CỦA BOT PUPPETEER
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function chayBotPuppeteer(danhSachNhom, tieuDe, noiDung, duongDanAnh) {
    const browser = await puppeteer.launch({
        headless: false, 
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', // Mở bằng Edge
        args: ['--disable-notifications'],
        userDataDir: './fb-session' 
    });
    const page = await browser.newPage();

    try {
        for (let i = 0; i < danhSachNhom.length; i++) {
            console.log(`\n👉 Đang xử lý nhóm: ${danhSachNhom[i]}`);
            await page.goto(danhSachNhom[i], { waitUntil: 'networkidle2' });
            await delay(4000);

            // 1. Click vào ô "Bạn viết gì đi..." 
            const boxClickSelectors = ['::-p-text(Bạn viết gì đi)', '::-p-text(Write something)'];
            for (let sel of boxClickSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    await page.click(sel);
                    break;
                } catch (e) {} 
            }
            await delay(3000); 

            // 2. UP ẢNH 
            if (duongDanAnh) {
                console.log('📸 Đang tải ảnh lên...');
                const fileInputs = await page.$$('input[type="file"]');
                if (fileInputs.length > 0) {
                    const targetFileInput = fileInputs[fileInputs.length - 1];
                    await targetFileInput.uploadFile(duongDanAnh);
                    await delay(8000); 
                }
            }

            // 3. GÕ TIÊU ĐỀ VÀ NỘI DUNG 
            console.log('📝 Đang tìm ô để gõ...');
            await delay(3000); // Đợi popup ổn định sau khi up ảnh

            let daGoTieuDe = false;

            // 3.1: Thử tìm và gõ vào ô Tiêu đề 
            if (tieuDe) {
                try {
                    // Quét các kiểu ô Tiêu đề thường gặp trên FB
                    const tieuDeSelectors = [
                        'input[placeholder*="Tiêu đề"]', 
                        'textarea[placeholder*="Tiêu đề"]', 
                        'input[aria-label*="Tiêu đề"]',
                        'div[aria-label*="Tiêu đề"]'
                    ];
                    
                    for (let sel of tieuDeSelectors) {
                        const boxTieuDe = await page.$(sel);
                        if (boxTieuDe) {
                            await boxTieuDe.click(); // Click để đưa con trỏ vào ô
                            await delay(500);
                            await page.keyboard.type(tieuDe, { delay: 50 }); // Dùng bàn phím gõ thẳng vào
                            daGoTieuDe = true;
                            console.log('-> Đã gõ Tiêu đề vào ô riêng!');
                            await delay(1000);
                            break; 
                        }
                    }
                } catch (e) {}
            }

            // 3.2: Tìm và gõ vào ô Nội dung chính
            try {
                const noiDungSelectors = [
                    'div[aria-label*="Tạo bài viết"][role="textbox"]',
                    'div[aria-label*="Bạn viết gì đi"][role="textbox"]',
                    'div[aria-label*="Viết gì đó"][role="textbox"]',
                    'div[aria-label*="Mô tả"][role="textbox"]', 
                    'div[aria-label*="Write something"][role="textbox"]',
                    'div[role="textbox"][contenteditable="true"]' 
                ];

                let boxNoiDung = null;
                for (let sel of noiDungSelectors) {
                    const boxes = await page.$$(sel);
                    if (boxes.length > 0) {
                        
                        boxNoiDung = boxes[boxes.length - 1]; 
                        break;
                    }
                }

                if (boxNoiDung) {
                    await boxNoiDung.click();
                    await delay(1000); 
                    const textCanGo = (tieuDe && !daGoTieuDe) ? (tieuDe + '\n\n' + noiDung) : noiDung;
                    
                    await page.keyboard.type(textCanGo, { delay: 50 });
                    console.log('-> Đã gõ xong Nội dung!');
                } else {
                    console.log('❌ BÓ TAY: Không tìm thấy ô nhập nội dung nào. Nhóm này bị cấu hình khác thường!');
                }
            } catch (e) {
                console.log('❌ Lỗi khi gõ nội dung:', e.message);
            }
            
            await delay(3000);

            // 4. BẤM ĐĂNG
            console.log('🚀 Chuẩn bị bấm Đăng bài...');
            try {
                // Quét tìm nút "Đăng" or "Post" 
                const btnDangSelectors = [
                    'div[aria-label="Đăng"][role="button"]',
                    'div[aria-label="Post"][role="button"]'
                ];

                let daBamDang = false;
                for (let sel of btnDangSelectors) {
                    const btnDang = await page.$(sel);
                    if (btnDang) {
                        await delay(2000); 
                        await btnDang.click();
                        console.log('-> Đã click nút ĐĂNG thành công! 🎯');
                        daBamDang = true;
                        break;
                    }
                }

                if (!daBamDang) {
                    console.log('❌ Không tìm thấy nút Đăng. Có thể do mạng chậm hoặc giao diện lạ!');
                } else {
                    
                    console.log('⏳ Đang chờ Facebook xuất bản bài viết...');
                    await delay(15000); 
                }

            } catch (e) {
                console.log('❌ Lỗi khi bấm đăng:', e.message);
            }

            console.log(`✅ Hoàn tất xử lý nhóm ${i + 1}. Nghỉ ngơi 20s trước khi qua nhóm tiếp theo...`);
            // Nghỉ 20 giây giữa các nhóm để tránh bị Facebook đánh dấu là spam 
            if (i < danhSachNhom.length - 1) await delay(20000)

            console.log(`✅ Xong nhóm ${i + 1}. Đợi 15s trước khi qua nhóm tiếp theo...`);
            if (i < danhSachNhom.length - 1) await delay(15000); 
        }
        console.log('\n🎉 ĐÃ HOÀN THÀNH TOÀN BỘ KỊCH BẢN!');
    } catch (error) {
        console.error('❌ Lỗi kịch bản:', error.message);
    } finally {
        await delay(10000); 
        await browser.close();
    }
}

app.listen(3000, () => {
    console.log('🌐 Server đã mở! Truy cập: http://localhost:3000');
});