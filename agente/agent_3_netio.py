# agent.py
import os
import time
import json
import random
import requests
from datetime import datetime, date, timedelta
from pathlib import Path
from io import BytesIO
from typing import Optional
from PIL import Image, ImageDraw, ImageFont  # pip install pillow
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

# =======================
# CONFIG (ENV VARS)
# =======================
SERVER = os.getenv("SERVER", "http://localhost:8000").rstrip("/")
UUID_EQUIPO = os.getenv("UUID_EQUIPO", "centro-pablo")

# IDs: se resuelven dinámicamente al iniciar
CLIENTE_ID = None
CENTRO_ID = None
DISPOSITIVO_ID = None

IMAGE_MODE = os.getenv("IMAGE_MODE", "file").lower()  # "file" | "screen"
IMAGE_PATH = os.getenv("IMAGE_PATH", r"C:\Users\Alejandro\Pictures\quetros2.jpg")

DEFAULT_PICTURES = Path(os.environ.get("USERPROFILE", "")) / "Pictures"
IMAGE_SAVE_DIR = Path(os.getenv("IMAGE_SAVE_DIR", str(DEFAULT_PICTURES)))
SCREENSHOT_NAME = os.getenv("SCREENSHOT_NAME", "screenshot.jpg")
SCREENSHOT_PATH = IMAGE_SAVE_DIR / SCREENSHOT_NAME

CENTER_NAME = os.getenv("CENTER_NAME", "Centro Desconocido")
CAPTURE_AT = os.getenv("CAPTURE_AT", "14:29")  # "HH:MM[,HH:MM...]"

TIMEZONE_LABEL = os.getenv("TZ", "America/Santiago")
PULL_WAIT_SECONDS = int(os.getenv("PULL_WAIT_SECONDS", "20"))
IDLE_SLEEP_SECONDS = float(os.getenv("IDLE_SLEEP_SECONDS", "1"))
JITTER_MAX_SECONDS = float(os.getenv("JITTER_MAX_SECONDS", "3"))
UPLOAD_MAX_RETRIES = int(os.getenv("UPLOAD_MAX_RETRIES", "4"))
MONITOR_INDEX = int(os.getenv("MONITOR_INDEX", "0"))
DEBUG_SAVE = os.getenv("DEBUG_SAVE", "0") == "1"

# ===== NETIO CONFIG =====
NETIO_HOST = os.getenv("NETIO_HOST", "10.11.10.171")   # IP/DNS
NETIO_PORT = os.getenv("NETIO_PORT", "")               # ej "8090" (vacío = 80)
NETIO_PATH = os.getenv("NETIO_PATH", "/netio.json")    # ruta JSON API
NETIO_USER = os.getenv("NETIO_USER", "netio")          # usuario JSON API (no el del login web)
NETIO_PASS = os.getenv("NETIO_PASS", "753524")
NETIO_TIMEOUT = float(os.getenv("NETIO_TIMEOUT", "3.0"))
NETIO_PUSH_EVERY = int(os.getenv("NETIO_PUSH_EVERY", "10"))  # cada Xs reporta estado al backend

# =======================
# RESOLVE IDs
# =======================
def resolve_ids_by_uuid() -> dict:
    """Consulta al backend por UUID y devuelve {cliente_id, centro_id, dispositivo_id, nombre}."""
    url = f"{SERVER}/api/centros/resolve"
    r = requests.get(url, params={"uuid_equipo": UUID_EQUIPO}, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"resolve failed: {r.status_code} {r.text}")
    return r.json()

# =======================
# UTILIDADES
# =======================
def log(*args):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts} {TIMEZONE_LABEL}]", *args, flush=True)

def parse_horas(s: str):
    horas = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        hh, mm = part.split(":")
        horas.append((int(hh), int(mm)))
    return sorted(horas)

AUTO_TIMES = parse_horas(CAPTURE_AT)

def proxima_ejecucion(now: datetime) -> datetime:
    candidatos = []
    for hh, mm in AUTO_TIMES:
        dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if dt > now:
            candidatos.append(dt)
    if not candidatos:
        hh, mm = AUTO_TIMES[0]
        mañana = (now + timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return mañana
    return min(candidatos)

# =======================
# CONSTRUCCIÓN DE IMAGEN
# =======================
def _draw_label(img: Image.Image, center_name: str) -> bytes:
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    text = f"{center_name}  |  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    padding = 10
    w, h = img.size
    try:
        # Pillow >= 9
        tw = draw.textlength(text, font=font)
        th = font.size + 2
    except Exception:
        # Pillow < 9
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = (bbox[2] - bbox[0], bbox[3] - bbox[1])
    box_h = th + padding * 2
    try:
        draw.rectangle([0, h - box_h, w, h], fill=(0, 0, 0, 128))
    except Exception:
        draw.rectangle([0, h - box_h, w, h], fill=(0, 0, 0))
    draw.text((padding, h - box_h + padding), text, fill=(255, 255, 255), font=font)
    out = BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue()

def _make_placeholder(center_name: str, size=(1280, 720)) -> bytes:
    img = Image.new("RGB", size, (30, 60, 90))
    return _draw_label(img, center_name)

def _read_file_or_placeholder(path: Path, center_name: str) -> bytes:
    if path.exists() and path.stat().st_size > 0:
        img = Image.open(path).convert("RGB")
        return _draw_label(img, center_name)
    else:
        log(f"Archivo no encontrado o vacío: {path}")
        return _make_placeholder(center_name)

# =======================
# CAPTURA PANTALLA
# =======================
def _capture_with_pyautogui_to_file(out_path: Path) -> bool:
    try:
        import pyautogui
        img = pyautogui.screenshot()
        img = img.convert("RGB")
        img.save(out_path, "JPEG", quality=95)
        log(f"pyautogui: screenshot guardado en {out_path} (size={img.size})")
        return True
    except Exception as e:
        log("screen capture ERROR (pyautogui):", repr(e))
        return False

def _capture_with_mss_to_file(out_path: Path) -> bool:
    try:
        import mss
        with mss.mss() as sct:
            monitors = sct.monitors
            idx = MONITOR_INDEX if 0 <= MONITOR_INDEX < len(monitors) else (1 if len(monitors) > 1 else 0)
            raw = sct.grab(monitors[idx])
            img = Image.frombytes("RGB", raw.size, raw.rgb)
            img.save(out_path, "JPEG", quality=95)
            log(f"mss: screenshot guardado en {out_path} (size={img.size})")
            return True
    except Exception as e:
        log("screen capture ERROR (mss):", repr(e))
        return False

def capture_screen_and_save() -> Path:
    IMAGE_SAVE_DIR.mkdir(parents=True, exist_ok=True)
    out = SCREENSHOT_PATH
    try:
        if out.exists():
            out.unlink()
    except Exception:
        pass
    if _capture_with_pyautogui_to_file(out):
        return out
    if _capture_with_mss_to_file(out):
        return out
    Image.new("RGB", (1280, 720), (30, 60, 90)).save(out, "JPEG", quality=85)
    log(f"placeholder: guardado en {out}")
    return out

def read_file_after_wait(path: Path, timeout=5.0) -> bytes:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if path.exists() and path.stat().st_size > 0:
            return path.read_bytes()
        time.sleep(0.2)
    if path.exists():
        return path.read_bytes()
    raise FileNotFoundError(f"No se generó el archivo a tiempo: {path}")

# =======================
# API BACKEND (capturas)
# =======================
def subir_imagen(img_bytes: bytes, fecha_reporte: date, origen: str = "auto") -> dict:
    url = f"{SERVER}/api/capturas/upload"
    data = {
        "uuid_equipo": UUID_EQUIPO,
        "fecha_reporte": fecha_reporte.isoformat(),
        "origen": origen,
    }
    filename = "screenshot.jpg"
    files = {"file": (filename, img_bytes, "image/jpeg")}
    backoff = 1.5
    for intento in range(1, UPLOAD_MAX_RETRIES + 1):
        try:
            r = requests.post(url, data=data, files=files, timeout=60)
            if r.status_code == 200:
                log("upload OK:", r.text)
                return r.json()
            else:
                log(f"upload HTTP {r.status_code}:", r.text)
        except Exception as e:
            log("upload ERROR:", repr(e))
        if intento < UPLOAD_MAX_RETRIES:
            sleep_s = backoff ** intento + random.uniform(0, 1.5)
            log(f"reintentando upload en {sleep_s:.1f}s (intento {intento+1}/{UPLOAD_MAX_RETRIES})")
            time.sleep(sleep_s)
    raise RuntimeError("No se pudo subir la imagen después de varios reintentos.")

# =======================
# OBTENER BYTES
# =======================
def obtener_imagen_bytes() -> bytes:
    if IMAGE_MODE == "screen":
        out = capture_screen_and_save()
        time.sleep(2.0)
        raw = read_file_after_wait(out, timeout=5.0)
        img = Image.open(BytesIO(raw)).convert("RGB")
        return _draw_label(img, CENTER_NAME)
    p = Path(IMAGE_PATH)
    if not p.exists() or p.stat().st_size == 0:
        log(f"[fallback] IMAGE_MODE=file pero no existe {p}. Capturando pantalla…")
        out = capture_screen_and_save()
        time.sleep(2.0)
        raw = read_file_after_wait(out, timeout=5.0)
        img = Image.open(BytesIO(raw)).convert("RGB")
        return _draw_label(img, CENTER_NAME)
    return _read_file_or_placeholder(p, CENTER_NAME)

# =======================
# ORDENES / ACK
# =======================
def pull_orden() -> Optional[dict]:
    url = f"{SERVER}/api/ordenes/pull"
    try:
        r = requests.get(url, params={"uuid_equipo": UUID_EQUIPO, "wait": PULL_WAIT_SECONDS}, timeout=PULL_WAIT_SECONDS + 5)
        if r.status_code == 200:
            data = r.json()
            return data.get("orden")
        else:
            log("pull HTTP", r.status_code, r.text)
    except Exception as e:
        log("pull ERROR:", repr(e))
    return None

def ack_orden(orden_id: int):
    url = f"{SERVER}/api/ordenes/{orden_id}/ack"
    try:
        r = requests.post(url, timeout=15)
        if r.status_code == 200:
            log(f"ack orden {orden_id} OK")
        else:
            log(f"ack orden {orden_id} HTTP {r.status_code}:", r.text)
    except Exception as e:
        log(f"ack orden {orden_id} ERROR:", repr(e))

# =======================
# NETIO STATUS (telemetría)
# =======================
def _netio_url() -> str:
    base = f"http://{NETIO_HOST}"
    if NETIO_PORT:
        base += f":{NETIO_PORT}"
    return f"{base}{NETIO_PATH}"

def _auth_basic():
    return HTTPBasicAuth(NETIO_USER, NETIO_PASS)

def _auth_digest():
    return HTTPDigestAuth(NETIO_USER, NETIO_PASS)

def get_netio_status() -> dict:
    """
    Devuelve: {"online": bool, "outputs": {1: True/False/None, 2:..., 3:..., 4:...}}
    Intenta BASIC y, si el servidor lo requiere, reintenta con DIGEST.
    """
    out = {1: None, 2: None, 3: None, 4: None}
    url = _netio_url()
    try:
        # 1) Intento con BASIC
        r = requests.get(url, auth=_auth_basic(), timeout=NETIO_TIMEOUT)
        if r.status_code == 401:
            wa = r.headers.get("WWW-Authenticate", "")
            if "digest" in wa.lower():
                # 2) Reintento con DIGEST
                r = requests.get(url, auth=_auth_digest(), timeout=NETIO_TIMEOUT)

        if r.status_code != 200:
            log(f"NETIO status HTTP {r.status_code} url={url} user={NETIO_USER}")
            r.raise_for_status()

        data = r.json()
        outputs = data.get("Outputs") or []
        for o in outputs:
            oid = int(o.get("ID", 0))
            if 1 <= oid <= 4:
                out[oid] = bool(o.get("State", 0))
        return {"online": True, "outputs": out}

    except Exception as e:
        log("NETIO status error:", repr(e), "url=", url, "user=", NETIO_USER)
        return {"online": False, "outputs": out}

def push_netio_state_to_backend(state: dict):
    """
    POST al backend para guardar/actualizar estado del NETIO de este agente.
    Espera que exista el endpoint: POST /api/netio/state
    Body: {uuid_equipo, online, outputs, ts}
    """
    try:
        url = f"{SERVER}/api/netio/state"
        payload = {
            "uuid_equipo": UUID_EQUIPO,
            "online": bool(state.get("online")),
            "outputs": {str(k): state["outputs"].get(k) for k in [1, 2, 3, 4]},
            "ts": datetime.now().isoformat()
        }
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code != 200:
            log("push_netio_state HTTP", r.status_code, r.text)
    except Exception as e:
        log("push_netio_state error:", repr(e))


# ==== Ordenes NETIO (pull y ack) ====
def pull_netio_cmd(wait: int = 0) -> Optional[dict]:
    url = f"{SERVER}/api/netio/command/pull"
    try:
        r = requests.get(url, params={"uuid_equipo": UUID_EQUIPO, "wait": wait}, timeout=wait + 5)
        if r.status_code == 200:
            data = r.json()
            if data.get("id", 0) and data.get("items"):
                return data
    except Exception as e:
        log("pull NETIO cmd ERROR:", repr(e))
    return None

def ack_netio_cmd(cmd_id: int):
    url = f"{SERVER}/api/netio/command/{cmd_id}/ack"
    try:
        requests.post(url, timeout=10)
    except Exception as e:
        log("ack NETIO cmd ERROR:", repr(e))

# ==== Escritura en NETIO (una sola llamada con varios outlets) ====
def netio_write_items(items: list) -> bool:
    """
    items: [{"id": 1, "action": 1}, ...] ; action=0..5 segun API
    """
    url = _netio_url()
    body = {"Outputs": [{"ID": int(it["id"]), "Action": int(it["action"])} for it in items]}
    # intentar BASIC, si responde Digest, reintentar
    try:
        r = requests.post(url, json=body, auth=_auth_basic(), timeout=NETIO_TIMEOUT)
        if r.status_code == 401 and "digest" in r.headers.get("WWW-Authenticate", "").lower():
            r = requests.post(url, json=body, auth=_auth_digest(), timeout=NETIO_TIMEOUT)
        r.raise_for_status()
        return True
    except Exception as e:
        log("NETIO write error:", repr(e), "url=", url)
        return False


# =======================
# EJECUCIÓN
# =======================
def ejecutar_captura(origen: str, fecha: Optional[date] = None):
    if fecha is None:
        fecha = date.today()
    img_bytes = obtener_imagen_bytes()
    if DEBUG_SAVE:
        try:
            dbg = Path.cwd() / "debug_last.jpg"
            dbg.write_bytes(img_bytes)
            log(f"DEBUG_SAVE: escrito {dbg.resolve()}")
        except Exception as e:
            log("DEBUG_SAVE error:", repr(e))
    return subir_imagen(img_bytes, fecha_reporte=fecha, origen=origen)

def proxima_automatico_str(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def main():
    global CLIENTE_ID, CENTRO_ID, DISPOSITIVO_ID, CENTER_NAME
    try:
        resolved = resolve_ids_by_uuid()
        CLIENTE_ID = int(resolved["cliente_id"])
        CENTRO_ID = int(resolved["centro_id"])
        d = resolved.get("dispositivo_id")
        DISPOSITIVO_ID = int(d) if d is not None else None
        if not os.getenv("CENTER_NAME"):
            CENTER_NAME = resolved.get("nombre") or CENTER_NAME
    except Exception as e:
        print("ERROR resolviendo IDs por uuid_equipo:", repr(e), flush=True)
        raise

    log(
        "Agente iniciado.",
        f"SERVER={SERVER}",
        f"UUID={UUID_EQUIPO} cliente={CLIENTE_ID} centro={CENTRO_ID} disp={DISPOSITIVO_ID}",
        f"mode={IMAGE_MODE} image_path={IMAGE_PATH}",
        f"save_dir={IMAGE_SAVE_DIR} screenshot={SCREENSHOT_NAME}",
        f"center='{CENTER_NAME}' horarios={CAPTURE_AT}",
        f"NETIO host={NETIO_HOST}{(':'+NETIO_PORT) if NETIO_PORT else ''} user={NETIO_USER} push_every={NETIO_PUSH_EVERY}s",
    )

    now = datetime.now()
    siguiente_auto = proxima_ejecucion(now)
    log("Próxima captura automática:", proxima_automatico_str(siguiente_auto))

    # control de push periódico de estado NETIO (arranca inmediato)
    last_netio_push = 0.0

    while True:
        try:
            now = datetime.now()

            # 1) Captura automática si corresponde
            if now >= siguiente_auto:
                try:
                    log("Ejecutando captura automática…")
                    ejecutar_captura(origen="auto", fecha=date.today())
                except Exception as e:
                    log("Error en captura automática:", repr(e))
                siguiente_auto = proxima_ejecucion(datetime.now())
                log("Siguiente automática:", proxima_automatico_str(siguiente_auto))

            # 2) Pull de órdenes (long-poll)
            orden = pull_orden()
            if orden:
                log("Orden recibida:", json.dumps(orden))
                try:
                    # Comportamiento actual: retoma captura
                    try:
                        fecha_rep = date.fromisoformat(orden.get("fecha_reporte", date.today().isoformat()))
                    except Exception:
                        fecha_rep = date.today()
                    ejecutar_captura(origen="retoma", fecha=fecha_rep)
                finally:
                    ack_orden(int(orden["orden_id"]))
            else:
                # 3) Empuje periódico del estado NETIO
                t = time.time()
                if (t - last_netio_push) >= NETIO_PUSH_EVERY:
                    st = get_netio_status()
                    # log opcional al éxito:
                    # if st.get("online"): log(f"NETIO OK outputs={st['outputs']}")
                    push_netio_state_to_backend(st)
                    last_netio_push = t

                # 4) Consumir acciones NETIO (no bloquea)
                cmd = pull_netio_cmd(wait=0)   # non-block
                if cmd:
                    ok = netio_write_items(cmd.get("items", []))
                    # Refrescar estado inmediato si se ejecutó bien
                    if ok:
                        st2 = get_netio_status()
                        push_netio_state_to_backend(st2)
                    ack_netio_cmd(int(cmd["id"]))

                time.sleep(IDLE_SLEEP_SECONDS + random.uniform(0, JITTER_MAX_SECONDS))

        except KeyboardInterrupt:
            log("Saliendo por Ctrl+C")
            break
        except Exception as e:
            log("Loop ERROR:", repr(e))
            time.sleep(3.0)

if __name__ == "__main__":
    main()
