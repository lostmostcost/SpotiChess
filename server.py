import argparse
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


ROOT = Path(__file__).parent
PUBLIC_DIR = ROOT / "public"


class FrontendRequestHandler(SimpleHTTPRequestHandler):
    """Serve the static SPA from the public directory."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def run(host: str = "127.0.0.1", port: int = 5173) -> None:
    server = ThreadingHTTPServer((host, port), FrontendRequestHandler)
    print(f"Spotify Chess frontend is running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Spotify Chess frontend server.")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5173")))
    args = parser.parse_args()
    run(host=args.host, port=args.port)
