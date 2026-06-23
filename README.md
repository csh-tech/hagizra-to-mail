# 🔔 Hagizra to Mail

כלי מבוסס Node.js שבודק את ה-API של אתר החדשות "הגזרה" (Hagizra) כל 15 דקות.
ברגע שיש הודעות חדשות, המערכת אוספת אותן ושולחת אליך ישירות למייל בעיצוב נוח וקריא (RTL).

## 🚀 התקנה והפעלה

### 1. התקנת ספריות
ודאו שמותקן אצלכם [Node.js](https://nodejs.org/), ולאחר מכן הריצו בתיקיית הפרויקט:
```bash
npm install
```

### 2. הגדרות מערכת (.env)
שכפלו את הקובץ `.env.example` לקובץ בשם `.env` ומלאו את הפרטים הבאים:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_TO=recipient@gmail.com
MAIL_FROM=your_email@gmail.com
```

**איך משיגים סיסמת אפליקציה (App Password) בג'ימייל?**
1. היכנסו ל[הגדרות האבטחה של חשבון גוגל](https://myaccount.google.com/security).
2. ודאו שאימות דו-שלבי (2-Step Verification) מופעל.
3. היכנסו ל-[App Passwords](https://myaccount.google.com/apppasswords).
4. צרו סיסמה חדשה (עבור "Mail").
5. העתיקו את הסיסמה (16 תווים) והדביקו אותה בשדה `SMTP_PASS` בקובץ ה-`.env`.

### 3. הפעלת הסקריפט
כדי להתחיל את הריצה של הסקריפט, הריצו את הפקודה:
```bash
npm start
```
הסקריפט ירוץ ברקע, יבדוק הודעות חדשות כל 15 דקות וישלח אותן למייל שהגדרתם.

## 📧 דוגמה של המייל שמתקבל
כך נראה המייל שמגיע אליך:

![Hagizra Email Example](assets/images/email-preview.png)

## 🛠️ תצוגה מקדימה (בדיקה מקומית)
רוצים לראות איך המייל ייראה בלי לשלוח אותו באמת?
ניתן להריץ סקריפט שמייצר קובץ JSON בתיקיית `data` עם ה-HTML המלא של המייל, וכך תוכלו לפתוח את ה-HTML שנוצר בדפדפן.
```bash
node scripts/preview_email.js
```

## ☁️ הרצה אוטומטית בענן בחינם (GitHub Actions + Cron-job.org)

במקום להריץ את הסקריפט על המחשב שלך, אפשר להשתמש ב-GitHub Actions שיריץ אותו עבורך בחינם (הקוד כבר מוגדר בקובץ `.github/workflows/hagizra.yml`). 
מכיוון שהטיימר הפנימי של GitHub לא תמיד מדויק ויכול להתעכב, הפרויקט מוגדר לקבל "טריגר" (Trigger) משירות חיצוני חינמי ומהיר כמו **cron-job.org** שיפעיל את הריצה בדיוק כל 15 דקות.

### שלב 1: הגדרת סודות (Secrets) ומשתנים ב-GitHub
1. היכנסו למאגר (Repository) שלכם ב-GitHub ולחצו על לשונית **Settings**.
2. בתפריט הצד, גשו ל-**Secrets and variables** ואז בחרו ב-**Actions**.
3. תחת הלשונית **Secrets**, לחצו על **New repository secret** והוסיפו את כל הסודות הבאים (לפי אותם ערכים שהגדרתם ב-`.env`):
   * `SMTP_HOST` (לרוב: `smtp.gmail.com`)
   * `SMTP_PORT` (לרוב: `587`)
   * `SMTP_USER` (כתובת המייל שלכם)
   * `SMTP_PASS` (סיסמת האפליקציה שיצרתם)
   * `MAIL_TO` (המייל אליו יישלחו העדכונים)
   * `MAIL_FROM` (המייל ממנו יישלחו העדכונים)
   * `GH_PAT` - טוקן אישי (Personal Access Token). זה דרוש כדי שהסקריפט יוכל לעדכן את מספר ההודעה האחרונה שנקראה:
     * גשו ל-[הגדרות הטוקנים שלכם](https://github.com/settings/tokens).
     * צרו טוקן חדש (Generate new token - Classic) וסמנו לו הרשאות ל-`repo`.
     * העתיקו את הטוקן, חזרו ל-Secrets במאגר והכניסו אותו לערך של `GH_PAT`.
4. עברו ללשונית **Variables** (ליד ה-Secrets), לחצו על **New repository variable** וצרו משתנה חדש:
   * **Name:** `LAST_ID`
   * **Value:** `0`
   *(המשתנה הזה שומר את המזהה של ההודעה האחרונה שנקראה כדי לא לשלוח כפילויות).*

### שלב 2: הגדרת תזמון מדויק עם Cron-job.org
1. צרו משתמש חינמי באתר [cron-job.org](https://cron-job.org/).
2. בלוח הבקרה, צרו עבודה חדשה (Create Cronjob).
3. **Title:** בחרו שם (לדוגמה: Hagizra to Mail).
4. **URL:** הכניסו את הכתובת הבאה (הקפידו להחליף את `csh-tech` בשם המשתמש שלכם בגיטהאב ואת `hagizra-to-mail` בשם המאגר):
   `https://api.github.com/repos/csh-tech/hagizra-to-mail/dispatches`
5. **Execution schedule:** בחרו שיופעל **כל 15 דקות**.
6. בלשונית **Advanced**:
   * שנו את ה-**HTTP method** ל- `POST`.
   * תחת **Headers**, הוסיפו את המפתחות:
     1. Key: `Accept` | Value: `application/vnd.github.v3+json`
     2. Key: `Content-Type` | Value: `application/json`
     3. Key: `Authorization` | Value: `Bearer YOUR_GH_PAT` *(החליפו את `YOUR_GH_PAT` בטוקן ה-GH_PAT שיצרתם קודם).* 
   * תחת **Body**, סמנו את תיבת הטקסט והכניסו את ה-JSON הבא:
     ```json
     {
       "event_type": "run-hagizra"
     }
     ```
7. שמרו את ה-Cronjob (לחצו Create).

זהו! עכשיו השירות יפעיל את GitHub Actions שלכם בצורה אמינה ומדויקת כל 15 דקות, וכל ההודעות החדשות יישלחו אליכם למייל אוטומטית.
