# Workout Tracker

A personal, offline-first workout log that installs from the browser and syncs to a Google Sheet you own.

## 1. Put it online (GitHub Pages)

1. Create a free account at github.com, then create a new **public** repository, for example `workouts`. Free accounts only get Pages on public repositories. The code is public, but your workout data is not in it.
2. Push this folder to the repository's `main` branch.
3. In the repository, go to **Settings > Pages** and set **Source** to **GitHub Actions**.
4. Check the **Actions** tab. When the run is green, the app is at `https://YOUR-USERNAME.github.io/workouts/`.

## 2. Install it on your phone

Open that address on your phone.

- **Android (Chrome):** menu > **Add to Home screen** or **Install app**.
- **iPhone (Safari):** Share > **Add to Home Screen**.

Logging works from this point. Use **More > Download backup** until sync is set up.

## 3. Connect Google Sheets

1. Go to console.cloud.google.com and create a project.
2. Under **APIs & Services > Library**, enable **Google Sheets API** and **Google Drive API**.
3. Under **Google Auth Platform**, set the audience to **External**, keep it in **Testing**, and add your own Gmail address as a **Test user**.
4. Under **Clients**, create a **Web application** client. In **Authorized JavaScript origins**, add `https://YOUR-USERNAME.github.io` (no path, no trailing slash).
5. Copy the client ID. In the app, go to **More**, paste it, and tap **Connect Google**.

Google will warn that the app is unverified, because it's your own private app. Continue past the warning using your own account.

The app creates a Sheet called **Workout Tracker** and can only access files it created.

## Editing the Sheet

- You can edit values, delete rows, or add rows. Leave `id` blank on new rows and the app fills it in.
- `date` and `exercise` on the Sets tab are for reading only. Edits there are ignored.
- If the same row changes in both places, the most recent edit wins.
- Rows missing required values stay in the Sheet, are ignored by the app, and are reported on the More screen.
- If you empty a whole tab, the app treats it as a mistake and restores it from the phone.

## Google access expiry

Google access lasts about an hour. After that the app shows a banner asking you to tap to reconnect. Logging keeps working offline in the meantime, and nothing is lost.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run prepare-data` downloads the exercise data again and redraws the icons.

Exercise data and images come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).
