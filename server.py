import argparse
import os

import uvicorn


def run(host: str = "127.0.0.1", port: int = 5173, reload: bool = False) -> None:
    print(f"Spotify Chess is running at http://{host}:{port}")
    print("Frontend and backend API are served by the same FastAPI app.")
    uvicorn.run("backend.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the integrated Spotify Chess app.")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5173")))
    parser.add_argument("--reload", action="store_true", default=os.environ.get("RELOAD") == "1")
    args = parser.parse_args()
    run(host=args.host, port=args.port, reload=args.reload)
