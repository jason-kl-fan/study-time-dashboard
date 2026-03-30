# Study Time Dashboard

目前已升級成：
- `index.html`：前台輸入頁
- `admin.html`：後台管理頁
- Firebase Firestore 雲端同步

## 前台功能
- 開始 / 結束時間紀錄
- 今日紀錄
- 基本統計
- 每位人員各自一張時間分配圖
- 圖表下方顯示累積時間與比例
- 中英文雙語顯示

## 後台功能
- 人員與項目管理
- 每日 / 每週 / 每月統計
- 長條圖 / 圓餅圖
- 單筆編輯 / 刪除
- 匯出 CSV / Excel
- 與前台即時同步

## Firebase 已接入
目前專案已接上 Firebase 設定：
- projectId: `study-time-dashboard`
- Firestore 文件位置：`studyTimeDashboard/main`

## Firestore 規則
目前附上最簡單測試規則 `firestore.rules`：
```txt
allow read, write: if true;
```
這表示任何人都能讀寫，適合先測試。
正式上線前建議加上 Firebase Auth 與更嚴格的 Security Rules。

## 你還需要做的事
1. 到 Firebase Console 開啟 Firestore Database
2. 將 `firestore.rules` 套用到專案
3. 確認 GitHub Pages 網址可正常讀寫資料
