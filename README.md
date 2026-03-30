# Study Time Dashboard

目前已拆分成前台與後台兩個頁面：

- `index.html`：前台輸入頁
  - 開始 / 結束時間紀錄
  - 今日紀錄
  - 基本統計
  - 每位人員各自一張時間分配圖

- `admin.html`：後台管理頁
  - 人員與項目管理
  - 每日 / 每週 / 每月統計
  - 長條圖 / 圓餅圖
  - 單筆編輯 / 刪除
  - 匯出 CSV / Excel

## 技術
- HTML
- CSS
- Vanilla JavaScript
- Chart.js
- SheetJS (xlsx)

## 注意
目前仍為純前端版本，資料儲存在瀏覽器 localStorage。
若要跨裝置同步，需要再升級為 Firebase 或後端資料庫版本。
