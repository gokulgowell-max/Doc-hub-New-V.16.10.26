# Dynamic Document Hub - Google Apps Script Package

This directory contains the standalone Google Apps Script web application files.

## Files
1. **`Code.gs`**: Google Apps Script backend that connects to Google Sheets, Google Drive file storage, duplicate passport validation, and data serialization.
2. **`Index.html`**: The main responsive web portal layout with Recruiter Intake and password-protected Documentation Desk.
3. **`CSS.html`**: Embedded CSS styles, custom scrollbars, and animations.
4. **`JavaScript.html`**: Client-side logic, Google Script RPC bridge, file reader, and instant search filter.

## Setup Instructions

1. Open your **Google Sheet** (e.g., *Dynamic Document Hub Database*).
2. Go to **Extensions > Apps Script**.
3. Copy-paste the content of each file into the script editor:
   - `Code.gs`
   - `Index.html`
   - `CSS.html`
   - `JavaScript.html`
4. Click **Deploy > New Deployment**.
5. Select **Web App**:
   - **Execute as:** Me (your Google account)
   - **Who has access:** Anyone
6. Click **Deploy** and copy the published Web App URL.

## Passwords
- **Documentation Desk Password:** `Gowell123`
