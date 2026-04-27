#!/usr/bin/env python3
"""
LabelKit Data Preparation Script
==================================
Fetches images from a Google Drive folder, matches them with Telegram captions,
and outputs a JSON file ready to load into the LabelKit labeling app.

Works in Google Colab (recommended) or locally.

SETUP
-----
  Colab:  Run as-is. Authentication handled automatically via google.colab.auth.

  Local:  pip install -r requirements.txt
          Download OAuth credentials from Google Cloud Console:
            console.cloud.google.com → APIs & Services → Credentials
            → Create OAuth 2.0 Client ID (Desktop app) → download as credentials.json
          Place credentials.json in this directory, then run: python prepare_data.py

CONFIGURATION
-------------
  Fill in the three variables in the ── Configuration ── section below.
  IMAGES_FOLDER_ID  : the ID at the end of your Drive folder URL
  MESSAGES_DIR      : path to the folder containing per-channel .json files
                      e.g. "/content/drive/MyDrive/.../Telegram Messages"
  OUTPUT_FILE       : where to write the output (default: data.json)

IMAGE URL NOTE
--------------
  Image URLs use the Drive "direct view" format:
    https://drive.google.com/uc?export=view&id=FILE_ID
  For images to display in the app, the Drive folder must be shared as
  "Anyone with the link can view". Private folders require you to be
  logged into Google in the same browser session.
"""

# ── Configuration ──────────────────────────────────────────────────────────────

IMAGES_FOLDER_ID = ""
# The folder ID from your Drive image folder URL.
# e.g. for https://drive.google.com/drive/folders/1RGA5DGjORl3XDKcemMre...
#      use  "1RGA5DGjORl3XDKcemMre..."

MESSAGES_DIR = ""
# Local (or Colab-mounted) path to the folder containing per-channel JSON files.
# Colab example:  "/content/drive/MyDrive/digital_frontline/Data/Telegram Messages"
# Local example:  "/Users/yourname/data/telegram_messages"
# Can be nested — the script searches recursively for *.json files.

OUTPUT_FILE = "data.json"
# Where to write the output. In Colab, download this file from the Files panel.

TRANSLATE = True
# Translate captions to English using googletrans?
# Set False to skip (faster, no network calls for translation).
# Note: googletrans can be unreliable. If translations look wrong, use Google
# Translate manually or an LLM for better results.

MAX_IMAGES = None
# Limit to the first N images (useful for testing). None = process all.

# ───────────────────────────────────────────────────────────────────────────────

import os
import json
import sys
from pathlib import Path


def _check_deps():
    missing = []
    for pkg in ['pandas', 'tqdm']:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"Missing dependencies: {', '.join(missing)}")
        print("Run: pip install " + " ".join(missing))
        sys.exit(1)

_check_deps()

import pandas as pd
from tqdm import tqdm


# ── Authentication ─────────────────────────────────────────────────────────────

def authenticate():
    """Authenticate with Google. Handles Colab and local OAuth automatically."""
    # Colab
    try:
        from google.colab import auth as colab_auth
        colab_auth.authenticate_user()
        from google.auth import default
        creds, _ = default()
        print("✓ Authenticated via Google Colab")
        return creds
    except ImportError:
        pass

    # Local OAuth
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials

        SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
        token_path = Path('token.json')
        creds = None

        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not Path('credentials.json').exists():
                    print("\nERROR: credentials.json not found.")
                    print("\nTo use this script locally:")
                    print("  1. Go to console.cloud.google.com")
                    print("  2. Create a project and enable the Google Drive API")
                    print("  3. Create OAuth 2.0 credentials → Desktop App")
                    print("  4. Download as credentials.json and place it here")
                    print("\nAlternatively, run this script in Google Colab where")
                    print("authentication is handled automatically.")
                    sys.exit(1)
                flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
                creds = flow.run_local_server(port=0)
            token_path.write_text(creds.to_json())

        print("✓ Authenticated via local OAuth")
        return creds

    except ImportError:
        print("\nMissing: google-auth-oauthlib")
        print("Run: pip install google-api-python-client google-auth-oauthlib")
        sys.exit(1)


# ── Drive Helpers ──────────────────────────────────────────────────────────────

def list_drive_images(creds, folder_id):
    """
    List all image files in a Google Drive folder, sorted alphabetically by name.
    Returns a list of dicts: [{id: str, name: str}, ...]
    """
    from googleapiclient.discovery import build
    service = build('drive', 'v3', credentials=creds)

    files = []
    page_token = None
    while True:
        response = service.files().list(
            q=f"'{folder_id}' in parents and mimeType contains 'image/' and trashed=false",
            fields="nextPageToken, files(id, name)",
            pageToken=page_token,
            pageSize=1000,
        ).execute()
        files.extend(response.get('files', []))
        page_token = response.get('nextPageToken')
        if not page_token:
            break

    # Sort alphabetically — matches the sort order in the Google Apps Script
    files.sort(key=lambda f: f['name'])
    return files


# ── Caption Index ──────────────────────────────────────────────────────────────

def load_caption_index(messages_dir):
    """
    Load all per-channel JSON files into a nested lookup dict:
      { channel_name: { post_id (int): caption (str) } }

    Expected JSON format per file: a list of records with at minimum
      { "id": <int post_id>, "caption": <str or null>, ... }
    """
    index: dict[str, dict[int, str]] = {}
    messages_path = Path(messages_dir)

    if not messages_path.exists():
        print(f"  Warning: messages directory not found: {messages_dir}")
        return index

    json_files = sorted(messages_path.rglob('*.json'))
    print(f"  Found {len(json_files)} channel JSON files")

    for json_file in tqdm(json_files, desc="  Loading caption files", leave=False):
        channel_name = json_file.stem
        try:
            df = pd.read_json(str(json_file))
            channel_captions: dict[int, str] = {}
            for _, row in df.iterrows():
                post_id = row.get('id')
                caption = row.get('caption')
                if post_id is not None and caption and str(caption).strip() not in ('', 'null', 'None'):
                    channel_captions[int(post_id)] = str(caption)
            index[channel_name] = channel_captions
        except Exception as e:
            print(f"\n  Warning: could not load {json_file.name}: {e}")

    return index


# ── Filename Parsing ───────────────────────────────────────────────────────────

def parse_image_filename(filename: str):
    """
    Parse channel name and post ID from an image filename.

    Expected format: "{post_id}_...|{channel_name}.jpg"
    e.g. "10350_FUI_AgADjroxG65LAUk|hueviyherson.jpg"
         → channel = "hueviyherson", post_id = 10350

    Returns (channel, post_id) or (None, None) on failure.
    """
    stem = Path(filename).stem  # remove extension
    if '|' not in stem:
        return None, None
    try:
        channel = stem.split('|')[-1]
        post_id = int(stem.split('_')[0])
        return channel, post_id
    except (ValueError, IndexError):
        return None, None


# ── Translation ────────────────────────────────────────────────────────────────

def make_translator():
    try:
        from googletrans import Translator
        t = Translator()
        print("  Translation: enabled (googletrans)")
        print("  Note: if translations look garbled, use Google Translate or an LLM")
        return t
    except ImportError:
        print("  Translation: skipped (googletrans not installed)")
        print("  Run: pip install googletrans==4.0.0-rc1")
        return None


def translate_caption(caption: str, translator) -> str | None:
    if not caption or not translator:
        return None
    try:
        return translator.translate(caption, dest='en').text
    except Exception:
        return None


# ── Main Pipeline ──────────────────────────────────────────────────────────────

def prepare_dataset(
    images_folder_id: str,
    messages_dir: str,
    output_file: str = "data.json",
    translate: bool = True,
    max_images: int | None = None,
) -> list[dict]:
    print("\n── LabelKit Data Preparation ─────────────────────────────────────────")

    # 1. Auth
    print("\n[1/4] Authenticating with Google...")
    creds = authenticate()

    # 2. List images
    print(f"\n[2/4] Listing images in Drive folder: {images_folder_id}")
    image_files = list_drive_images(creds, images_folder_id)
    if max_images:
        image_files = image_files[:max_images]
    print(f"  {len(image_files)} image(s) found")

    # 3. Load captions
    print(f"\n[3/4] Loading captions from: {messages_dir}")
    caption_index = load_caption_index(messages_dir)
    total_captions = sum(len(v) for v in caption_index.values())
    print(f"  {len(caption_index)} channel(s), {total_captions} captioned posts")

    # 4. Build datapoints
    print(f"\n[4/4] Matching images to captions...")
    translator = make_translator() if translate else None

    datapoints = []
    no_caption_count = 0

    for file in tqdm(image_files, desc="  Processing"):
        filename: str = file['name']
        file_id: str = file['id']
        channel, post_id = parse_image_filename(filename)

        caption = None
        if channel and post_id is not None:
            caption = caption_index.get(channel, {}).get(post_id)

        if caption is None:
            no_caption_count += 1

        caption_translated = translate_caption(caption, translator) if caption else None

        datapoints.append({
            "id": Path(filename).stem,
            "imageName": filename,
            "imageUrl": f"https://drive.google.com/uc?export=view&id={file_id}",
            "caption": caption,
            "captionTranslated": caption_translated,
            "channel": channel,
            "postId": post_id,
        })

    # 5. Write output
    output_path = Path(output_file)
    output_path.write_text(
        json.dumps(datapoints, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    matched = len(datapoints) - no_caption_count
    print(f"\n── Summary ────────────────────────────────────────────────────────────")
    print(f"  Total datapoints   : {len(datapoints)}")
    print(f"  With captions      : {matched}  ({matched / max(len(datapoints), 1) * 100:.0f}%)")
    print(f"  No caption found   : {no_caption_count}")
    print(f"  Saved to           : {output_file}")
    print(f"\n✓ Done!")
    print(f"  → Upload {output_file} in LabelKit to start labeling.")
    print(f"  → Ensure your Drive images folder is shared as 'Anyone with the link'")
    print(f"    so images load in the browser.")

    return datapoints


# ── Entry Point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not IMAGES_FOLDER_ID:
        print("Error: Set IMAGES_FOLDER_ID in the configuration section at the top of this file.")
        sys.exit(1)
    if not MESSAGES_DIR:
        print("Error: Set MESSAGES_DIR in the configuration section at the top of this file.")
        sys.exit(1)

    prepare_dataset(
        images_folder_id=IMAGES_FOLDER_ID,
        messages_dir=MESSAGES_DIR,
        output_file=OUTPUT_FILE,
        translate=TRANSLATE,
        max_images=MAX_IMAGES,
    )
