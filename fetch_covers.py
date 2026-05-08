"""
Spotify API로 각 트랙의 앨범 커버 이미지를 다운로드하여
backend/assets/track_images/ 에 저장하고 data.json을 업데이트합니다.
"""
import json
import os
import re
import time
import requests

DATA_PATH = "backend/data.json"
IMAGE_DIR = "backend/assets/track_images"
CLIENT_ID = "0ed698ed181c4f58abf5a3788784fce7"
CLIENT_SECRET = "274fdadc646d4178ba3a090063a8b990"


def get_access_token():
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(CLIENT_ID, CLIENT_SECRET),
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def search_track(token, artist_name, track_name):
    q = f"track:{track_name} artist:{artist_name}"
    resp = requests.get(
        "https://api.spotify.com/v1/search",
        params={"q": q, "type": "track", "limit": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        print(f"  API 오류 {resp.status_code}: {resp.text[:100]}")
        return None
    items = resp.json().get("tracks", {}).get("items", [])
    if items:
        images = items[0].get("album", {}).get("images", [])
        if images:
            return images[0]["url"]  # 640x640 최대 사이즈
    return None


def safe_filename(text):
    return re.sub(r'[^\w\-]', '_', text)


def download_image(url, filepath):
    resp = requests.get(url, stream=True, timeout=15)
    if resp.status_code == 200:
        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(1024):
                f.write(chunk)
        return True
    return False


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)

    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    print("Spotify 토큰 발급 중...")
    token = get_access_token()
    print(f"토큰 발급 완료.\n")

    for artist in data["artists"]:
        artist_id = artist["artist_id"]
        artist_name = artist["artist_name"]
        print(f"[{artist_id}] {artist_name}")

        for track in artist["tracks"]:
            track_name = track["track_name"]
            filename = f"{artist_id}_{safe_filename(track_name)}.jpg"
            filepath = os.path.join(IMAGE_DIR, filename)
            relative_path = f"assets/track_images/{filename}"

            if os.path.exists(filepath):
                print(f"  [SKIP] {track_name}")
                track["cover_image"] = relative_path
                continue

            print(f"  검색: {track_name}", end="", flush=True)
            image_url = search_track(token, artist_name, track_name)

            if image_url:
                success = download_image(image_url, filepath)
                if success:
                    size = os.path.getsize(filepath)
                    print(f" → 저장 ({size // 1024}KB)")
                    track["cover_image"] = relative_path
                else:
                    print(f" → 다운로드 실패 (기존 URL 유지)")
            else:
                print(f" → Spotify 결과 없음 (기존 URL 유지)")

            time.sleep(0.1)

        print()

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("data.json 업데이트 완료!")


if __name__ == "__main__":
    main()
