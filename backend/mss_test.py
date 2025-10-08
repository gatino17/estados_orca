# mss_test.py
import sys
from PIL import Image
try:
    import mss
except Exception as e:
    print("ERROR import mss:", e)
    sys.exit(1)

try:
    with mss.mss() as sct:
        mons = sct.monitors  # [0]=virtual all, 1..N = reales
        print("Monitores detectados:", list(range(len(mons))), " -> len:", len(mons))
        for i, m in enumerate(mons):
            print(f"[{i}] {m}")
        # intenta capturar el 0 (todo) y el 1 (principal)
        for idx in (0, 1):
            if idx < len(mons):
                raw = sct.grab(mons[idx])
                img = Image.frombytes("RGB", raw.size, raw.rgb)
                out = f"screenshot_{idx}.jpg"
                img.save(out, "JPEG", quality=90)
                print("Guardado:", out, "tam:", img.size)
except Exception as e:
    print("ERROR capturando:", e)
