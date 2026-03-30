# Study Time Dashboard

一個純前端的時間紀錄與統計網頁，適合記錄不同人員在「念書 / 休閒 / 玩遊戲」等項目的時間分配。

## 功能

- 姓名與項目採下拉選單
- 可自訂新增更多人員與項目
- 用開始 / 結束按鈕記錄時間
- 自動計算每筆活動的分鐘數
- 支援每日 / 每週 / 每月統計
- 顯示長條圖、圓餅圖與明細表
- 可編輯 / 刪除單筆紀錄
- 可匯出 CSV 與 Excel
- 使用 localStorage 儲存資料，無需後端
- 可部署到 GitHub Pages

## 使用方式

直接開啟 `index.html` 即可使用。

## 技術

- HTML
- CSS
- Vanilla JavaScript
- Chart.js
- SheetJS (xlsx)

## 注意

- 目前資料儲存在瀏覽器本機 localStorage
- 換瀏覽器或清除瀏覽器資料後，紀錄會消失
- 若需要多人共用、跨裝置同步，需再加後端與資料庫
