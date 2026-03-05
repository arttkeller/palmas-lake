"""
Script de setup para criar o File Search Store no Google Gemini
e fazer upload do Memorial Descritivo e Quadro de Areas.

Uso:
  export GEMINI_API_KEY=sua_chave_aqui
  python scripts/setup_file_search.py

Apos rodar, adicione a variavel GEMINI_FILE_SEARCH_STORE no Easypanel
com o valor impresso pelo script.
"""

import os
import shutil
import sys
import tempfile
import time
import unicodedata

from google import genai

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
if not API_KEY:
    print("Erro: defina GEMINI_API_KEY no ambiente")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)

# Diretorio raiz do projeto (2 niveis acima de scripts/)
PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")

DOCS = [
    {
        "path": os.path.join(PROJECT_ROOT, "MEMORIAL DESCRITIVO PALMAS LAKE.docx"),
        "display_name": "Memorial Descritivo Tecnico - Palmas Lake Towers",
    },
    {
        "path": os.path.join(PROJECT_ROOT, "quadro de áreas Palmas Lake.pdf"),
        "display_name": "Quadro de Areas - Palmas Lake Towers (PDF)",
    },
    {
        "path": os.path.join(PROJECT_ROOT, "quadro_areas_palmas_lake.txt"),
        "display_name": "Quadro de Areas - Palmas Lake Towers (Texto Estruturado)",
    },
]


def _ascii_safe_path(path: str) -> str:
    """Se o nome do arquivo contiver caracteres nao-ASCII, copia para um
    arquivo temporario com nome seguro e retorna o caminho da copia.
    A API do Google genai envia o nome do arquivo em headers HTTP que
    exigem ASCII."""
    basename = os.path.basename(path)
    try:
        basename.encode("ascii")
        return path  # ja e seguro
    except UnicodeEncodeError:
        safe_name = unicodedata.normalize("NFKD", basename).encode("ascii", "ignore").decode("ascii")
        safe_name = safe_name.replace("  ", " ").strip()
        tmp_dir = tempfile.mkdtemp()
        safe_path = os.path.join(tmp_dir, safe_name)
        shutil.copy2(path, safe_path)
        return safe_path


print("1. Criando File Search Store...")
store = client.file_search_stores.create(
    config={"display_name": "palmas-lake-documentos-tecnicos"}
)
print(f"   Store criado: {store.name}")

for i, doc in enumerate(DOCS, start=2):
    path = os.path.normpath(doc["path"])
    if not os.path.exists(path):
        print(f"   AVISO: arquivo nao encontrado: {path}")
        continue

    upload_path = _ascii_safe_path(path)

    print(f"{i}. Fazendo upload de: {doc['display_name']}...")
    operation = client.file_search_stores.upload_to_file_search_store(
        file=upload_path,
        file_search_store_name=store.name,
        config={"display_name": doc["display_name"]},
    )

    while not operation.done:
        print("   Aguardando processamento...")
        time.sleep(5)
        operation = client.operations.get(operation)

    print(f"   Upload concluido!")

    # Limpar copia temporaria se criada
    if upload_path != path:
        os.remove(upload_path)
        os.rmdir(os.path.dirname(upload_path))

print()
print("=" * 60)
print("Setup completo!")
print()
print("Adicione esta variavel no Easypanel:")
print(f"  GEMINI_FILE_SEARCH_STORE={store.name}")
print("=" * 60)
