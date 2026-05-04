import os

file_path = r'C:\Users\Ivan Xavier\.gemini\antigravity\scratch\polycopy\src\server\index.ts'

with open(file_path, 'rb') as f:
    data = f.read()

# Mapa de bytes corrompidos (Double UTF-8 ou ISO-8859-1 as UTF-8)
# Exemplo: 'Ã´' em UTF-8 costuma aparecer quando algo foi salvo errado.
replacements = [
    (b'\xc3\x83\xc2\xb4', 'ô'.encode('utf-8')), # Ã´ -> ô
    (b'\xc3\x83\xc2\xa7', 'ç'.encode('utf-8')), # Ã§ -> ç
    (b'\xc3\x83\xc2\xa3', 'ã'.encode('utf-8')), # Ã£ -> ã
    (b'\xc3\x83\xc2\xb5', 'õ'.encode('utf-8')), # Ãµ -> õ
    (b'\xc3\x83\xc2\xa9', 'é'.encode('utf-8')), # Ã© -> é
    (b'\xc3\x83\xc2\xb3', 'ó'.encode('utf-8')), # Ã³ -> ó
    (b'\xc3\x83\x82\xc2\xa0', b' '),             # Espaço inquebrável corrompido
]

for old_bytes, new_bytes in replacements:
    data = data.replace(old_bytes, new_bytes)

# Tentar decodificar para string para fazer as inserções de lógica
try:
    content = data.decode('utf-8')
except UnicodeDecodeError:
    print("Erro de decodificação, tentando com 'ignore' para salvar o que for possível.")
    content = data.decode('utf-8', errors='ignore')

# Injetar o Header de charset se não existir
if "res.setHeader('Content-Type', 'text/html; charset=utf-8')" not in content:
    content = content.replace(
        "app.get('/dashboard', auth, async (req, res) => {",
        "app.get('/dashboard', auth, async (req, res) => {\n  res.setHeader('Content-Type', 'text/html; charset=utf-8');"
    )

# Garantir a Meta Tag
if '<meta charset="UTF-8">' not in content:
    content = content.replace('<head>', '<head><meta charset="UTF-8">')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Reparo de bytes concluído com sucesso.")
