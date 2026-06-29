# Zerotrustgateway

Chặn quảng cáo ở cấp DNS bằng Cloudflare Zero Trust Gateway — miễn phí, không cần cài app hay extension.

Hoạt động với gói miễn phí của Cloudflare (lên đến 300.000 domain bị chặn).

## Cách hoạt động

1. Tải danh sách domain cần chặn từ internet
2. Lọc và loại bỏ trùng lặp, loại bỏ các domain được cho phép
3. Upload lên Cloudflare Gateway dưới dạng "Lists"
4. Tạo Gateway DNS policy chặn toàn bộ các domain trong danh sách

## Cài đặt

### Bước 1 — Fork repo

Bấm **Fork → Create fork** ở góc trên bên phải.

### Bước 2 — Lấy API Token + Account ID từ Cloudflare

**Account ID:**
- Vào [dash.cloudflare.com](https://dash.cloudflare.com)
- Nhìn sidebar bên phải, copy **Account ID**

**API Token:**
- Vào [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
- Bấm **Create Token → Create Custom Token**
- Đặt tên tùy ý
- Mục **Permissions** chọn: `Zero Trust` → `Edit`
- Bấm **Continue to summary → Create Token**
- Copy token lại (chỉ hiện 1 lần duy nhất)

### Bước 3 — Thêm secrets vào repo

Vào repo vừa fork → **Settings → Secrets and variables → Actions → New repository secret**

Thêm 2 secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Bước 4 — Chạy workflow

Vào tab **Actions → Update blocklists → Run workflow**

Chờ khoảng 1-2 phút.

### Bước 5 — Lấy địa chỉ DNS

Vào [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Gateway → DNS Locations → Add a location** → đặt tên tùy ý → **Add location** → copy 2 địa chỉ DNS.

Set 2 địa chỉ đó vào router hoặc thiết bị là xong. Blocklist tự cập nhật mỗi thứ 2 hàng tuần.
