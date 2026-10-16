# Dynamic Document Hub 🚀

A modern web application for team recruiters, documentation desks, and managers to manage candidate submissions and document tracking with real-time cloud synchronization.

---

## 🌐 How to Publish to GitHub Pages for Your Team

This project is already pre-configured with **GitHub Actions** (`.github/workflows/deploy.yml`) and relative asset paths (`base: './'`) for 1-click deployment to GitHub Pages.

### Step 1: Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new)
2. Enter a repository name (e.g. `dynamic-document-hub`)
3. Choose **Public** (so all team members can open the URL)
4. Click **Create repository**

### Step 2: Push Your Code to GitHub
Run the following commands in your terminal or Command Prompt inside this folder:

```bash
git init
git add .
git commit -m "Initial commit - Dynamic Document Hub"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/dynamic-document-hub.git
git push -u origin main
```

*(Alternatively, use [GitHub Desktop](https://desktop.github.com/) to publish this folder directly with one click).*

### Step 3: Enable GitHub Pages in Repository Settings
1. On GitHub, navigate to your repository
2. Go to **Settings** > **Pages** (in the left sidebar)
3. Under **Build and deployment** > **Source**, select **GitHub Actions**
4. The automated deployment workflow will run immediately in the **Actions** tab

### Step 4: Share Public Link with Your Team
Once the deployment finishes (takes ~1 minute):
- Your public website link will be:  
  **`https://<YOUR_GITHUB_USERNAME>.github.io/dynamic-document-hub/`**
- Any team member can open this link on their browser (desktop or mobile) to view and submit documents!

---

## 👥 Sharing Backend Settings with Team Members

In the **Manager Dashboard**, you can configure your **Google Sheets / Google Apps Script Web App URL**. The application provides a **"Generate Team Link"** feature that encodes your connection settings into a shareable link so team members are instantly connected with zero manual setup. Google Sheets and Google Drive serve as the primary backup and cloud storage.

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build for production
npm run build
```

