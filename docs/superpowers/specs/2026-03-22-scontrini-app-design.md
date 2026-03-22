# Scontrini App — Design Specification

**Date:** 2026-03-22
**Status:** Approved

---

## 1. Overview

Web application that allows a single user to photograph receipts and documents using their device camera, automatically extract metadata via AI, generate a PDF from each session's photos, and save everything to Google Drive with a searchable index.

**Core use case:** User photographs a receipt (e.g., boiler purchase, water bill, medical prescription) and can find it months or years later by searching category, description, or tags — without remembering the exact date.

---

## 2. Architecture

**Type:** Pure frontend (HTML + JavaScript) — no backend required.
**Hosting:** GitHub Pages or Netlify (static files).
**Authentication:** Google OAuth2 via `gapi.js` for Drive and Sheets. Gemini API authenticated separately via API key (not OAuth2).

### Gemini API key management

Since there is no backend, the Gemini API key cannot be kept secret on the server. Strategy: the user enters their own Gemini API key once at first launch; it is stored in `localStorage`. This is the standard approach for personal single-user tools with no backend. The key is never sent anywhere except directly to the Gemini API endpoint.

### External services

| Service | Purpose | Cost |
|---|---|---|
| Google OAuth2 | Authentication for Drive + Sheets | Free |
| Google Drive API v3 | File storage and folder management | Free (15 GB) |
| Google Sheets API | Searchable index | Free |
| Gemini API (`gemini-3-flash-preview`) | AI metadata extraction from images | Free tier |

---

## 3. Components

| Component | Responsibility |
|---|---|
| **Camera Capture** | Access device camera via `getUserMedia`, capture photos as base64 images |
| **Session Manager** | Hold captured photos in memory for the current session |
| **AI Analyzer** | Send each photo to Gemini API, receive structured JSON metadata per photo |
| **Metadata Review** | Aggregate per-photo metadata into a single session record; display for user confirmation or manual editing |
| **PDF Generator** | Build a PDF via `jsPDF` — one full page per photo, auto orientation |
| **Drive Uploader** | Create folder structure idempotently and upload PDF to Google Drive |
| **Index Updater** | Read-modify-write `scontrini-index.json` in Drive root and append row to Google Sheets |
| **Search View** | Read the index and allow filtering by category, tags, description, date |

---

## 4. Data Flow

```
1. App opens
   → If no Gemini API key in localStorage: prompt user to enter it, save to localStorage
   → Google OAuth2 login (scopes: Drive + Sheets only)
   → OAuth2 access token saved in memory (not localStorage); on expiry, re-prompt login

2. Photo session
   → User taps "Scatta foto"
   → Camera opens via getUserMedia
   → Each photo captured as base64
   → User can take multiple photos before proceeding

3. AI analysis (per photo)
   → Each photo sent individually to Gemini API with structured prompt
   → Each response parsed as JSON:
     {
       "categoria": "Casa",
       "descrizione": "Caldaia Baxi modello X",
       "tag": ["garanzia", "caldaia", "riscaldamento"],
       "importo": "1200.00",
       "data": "2026-03-22"
     }

4. Metadata review (session level)
   → All per-photo results are merged into ONE session metadata record.
     Merge rules:
       - categoria: use the most frequent value across photos
       - descrizione: concatenate unique descriptions with ", "
       - tag: union of all tag arrays, deduplicated
       - importo: sum of all non-empty importo values
       - data: use the earliest date found, or today if none
   → Single merged metadata shown to user for confirmation or editing
   → User taps "Salva sessione"

5. PDF generation
   → jsPDF creates PDF with all session photos
   → One photo per page, auto portrait/landscape orientation

6. Drive upload
   → Determine folder path: Documenti/{YYYY-MM}/{Categoria}/
       - YYYY-MM derived from session date (e.g., "2026-03")
       - Categoria comes from the confirmed session metadata (e.g., "Scontrini", "Ricette", "Analisi")
   → For each level of the path, search for existing folder by name + parent ID
         (Drive API: files.list with query "name='{name}' and '{parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false")
   → Create folder only if not found — prevents duplicates
   → Upload PDF with filename: {descrizione-slug}_{YYYYMMDD-HHmm}.pdf
   → Example: caldaia-baxi_20260322-1430.pdf (inside Documenti/2026-03/Scontrini/)

7. Index update (read-modify-write)
   → Download current scontrini-index.json from Drive (or start with [] if not found)
   → Parse JSON array, append new entry, re-upload as updated file
   → Also append row to Google Sheets "Scontrini Index"
   → Note: single-user app, no concurrent write risk
```

---

## 5. scontrini-index.json Schema

The index file is a JSON array of objects. Each entry represents one saved session:

```json
[
  {
    "id": "uuid-v4",
    "data": "2026-03-22",
    "categoria": "Casa",
    "descrizione": "Caldaia Baxi ECO5",
    "tag": ["garanzia", "caldaia", "riscaldamento"],
    "importo": "1200.00",
    "drive_file_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "drive_url": "https://drive.google.com/file/d/.../view"
  }
]
```

The Google Sheets "Scontrini Index" mirrors these columns:
`id | data | categoria | descrizione | tag (comma-separated) | importo | drive_file_id | drive_url`

---

## 6. Google Drive Structure

```
Documenti/
  2026-03/
    Scontrini/
      caldaia-baxi_20260322-1430.pdf
    Ricette/
      ricetta-medica_20260318-0930.pdf
    Analisi/
      esami-sangue_20260310-1100.pdf
  2026-02/
    Bollette/
      bolletta-acqua_20260215-1100.pdf
  scontrini-index.json
  Scontrini Index        ← Google Sheets workbook
```

### Category resolution logic

1. Gemini suggests a categoria from the image analysis.
2. The Drive Uploader reads the list of existing categoria folders under the current `YYYY-MM` folder (and all past months) to build a known-categories list.
3. **If the suggested categoria matches an existing folder** (case-insensitive) → use it automatically.
4. **If the suggested categoria is new** → show the user a dialog:
   - Display Gemini's suggestion
   - List existing categories as quick-select options
   - Allow the user to confirm Gemini's suggestion (creates new folder) or pick an existing one
5. The confirmed categoria doubles as both the Drive subfolder name and the `categoria` metadata field.

---

## 7. AI Analyzer — Gemini Prompt

The prompt sent with each image is fixed and instructs Gemini to return valid JSON only:

```
Analizza questa immagine di un documento (scontrino, ricevuta, bolletta, ricetta medica, esame, ecc.).
Restituisci SOLO un oggetto JSON valido con questi campi:
- categoria: stringa (es. "Casa", "Auto", "Salute", "Utenze", "Alimentari", "Altro")
- descrizione: stringa breve e descrittiva (es. "Caldaia Baxi ECO5", "Bolletta acqua Q1 2026")
- tag: array di stringhe (es. ["garanzia", "caldaia", "riscaldamento"])
- importo: stringa con importo in euro se visibile, altrimenti ""
- data: stringa in formato YYYY-MM-DD se visibile, altrimenti ""

Nessun testo aggiuntivo, solo JSON.
```

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Camera not available | Fallback to manual file upload input |
| Gemini API error / timeout | Skip AI for that photo; user fills metadata manually; session continues |
| Drive upload fails | Auto-retry up to 3 times with exponential backoff; if still failing, offer local PDF download |
| Google OAuth2 token expired | Re-prompt login popup (no silent refresh — incompatible with pure frontend) |
| Sheets API unavailable | Index update skipped (Drive file still saved); warning shown to user |
| Gemini JSON parse error | Fall back to manual metadata entry for that photo |

---

## 9. Search View

Reads `scontrini-index.json` from Drive on load. Supports filtering by:
- Free text (matches against descrizione and tag)
- Categoria (dropdown)
- Date range
- Importo range

Each result shows a link to open the PDF directly in Google Drive.

---

## 10. Tech Stack Summary

| Technology | Role |
|---|---|
| HTML + CSS + Vanilla JS | App shell and UI |
| `getUserMedia` API | Camera access |
| `jsPDF` (CDN) | PDF generation |
| `gapi.js` (Google API Client) | OAuth2, Drive API, Sheets API |
| Gemini REST API | AI metadata extraction (key from localStorage) |

No bundler or build step required — plain HTML files deployable anywhere.

---

## 11. Out of Scope

- Multi-user support
- Offline mode / PWA
- Receipt OCR line-item parsing (only summary metadata extracted)
- Editing or deleting existing receipts
- Notifications or reminders
