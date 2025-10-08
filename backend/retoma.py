# retoma.py
import requests
print(requests.post("http://localhost:8000/api/capturas/1/retomar", timeout=15).text)