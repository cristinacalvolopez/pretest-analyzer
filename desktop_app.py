"""Lanzador de escritorio para Pretest Analyzer.

Arranca el servidor en un puerto local libre, abre el navegador
automáticamente y muestra una pequeña ventana con el estado. Pensado para
empaquetarse con PyInstaller en un único ejecutable (.app / .exe) que
cualquiera pueda abrir con doble clic, sin terminal ni Python instalado.
"""
import socket
import threading
import time
import tkinter as tk
import webbrowser

import uvicorn

from app.main import app

HOST = "127.0.0.1"
CANDIDATE_PORTS = (8000, 8001, 8002, 8003, 8004)


def _find_free_port() -> int:
    for port in CANDIDATE_PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            if s.connect_ex((HOST, port)) != 0:
                return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


class ServerThread(threading.Thread):
    def __init__(self, port: int):
        super().__init__(daemon=True)
        config = uvicorn.Config(app, host=HOST, port=port, log_level="warning")
        self.server = uvicorn.Server(config)

    def run(self) -> None:
        self.server.run()

    def stop(self) -> None:
        self.server.should_exit = True


def main() -> None:
    port = _find_free_port()
    url = f"http://{HOST}:{port}"

    server_thread = ServerThread(port)
    server_thread.start()

    def open_browser() -> None:
        time.sleep(1.0)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    root = tk.Tk()
    root.title("Pretest Analyzer")
    root.geometry("440x200")
    root.resizable(False, False)

    tk.Label(root, text="Pretest Analyzer está en marcha", font=("Helvetica", 15, "bold")).pack(pady=(24, 8))
    tk.Label(root, text=f"Se ha abierto en tu navegador:\n{url}", justify="center").pack(pady=4)
    tk.Label(
        root,
        text="Si no se abrió solo, copia esa dirección en tu navegador.\nCierra esta ventana para apagar la aplicación.",
        justify="center",
        fg="#666666",
    ).pack(pady=(4, 16))

    def on_close() -> None:
        server_thread.stop()
        root.destroy()

    tk.Button(root, text="Cerrar aplicación", command=on_close, padx=16, pady=6).pack()
    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
