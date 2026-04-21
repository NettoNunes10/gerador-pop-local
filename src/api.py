from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import datetime
import logging
from .core.config import config
from .core.engine import PlaylistEngine
from .core.database import db

# Configuração de Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gerador POP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class State:
    def __init__(self):
        self.is_busy = False
        self.logs = []

state = State()

def add_log(msg):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    state.logs.append(f"[{ts}] {msg}")
    if len(state.logs) > 100:
        state.logs.pop(0)

class GenerateRequest(BaseModel):
    start_date: str
    days: int

@app.get("/status")
def get_status():
    return {
        "status": "online",
        "is_busy": state.is_busy,
        "database": "Connected" if db.conn else "Error",
        "music_root_exists": os.path.exists(config.get_path('MUSIC_ROOT')),
        "timestamp": datetime.datetime.now().isoformat()
    }

@app.get("/templates")
def list_templates():
    template_dir = config.paths.get('TEMPLATES')
    if not template_dir or not os.path.exists(template_dir):
        return []
    return [f for f in os.listdir(template_dir) if f.endswith('.blm')]

@app.get("/config")
def get_config():
    return {
        "paths": config.paths,
        "favorite_artists": list(config.favorite_artists),
        "paid_rules": config.paid_rules,
        "surprise_rules": config.surprise_rules,
        "day_templates": config.day_templates
    }

@app.post("/config")
def update_config(new_config: dict):
    try:
        config.save(new_config)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Erro ao salvar config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/logs")
def get_logs():
    return {"logs": state.logs, "is_busy": state.is_busy}

@app.get("/stats")
def get_stats():
    if state.is_busy:
        return {"categories": [], "top_artists": []}
    return db.get_stats()

from fastapi.responses import StreamingResponse
import mimetypes

@app.get("/stream/{track_id}")
def stream_audio(track_id: int):
    cursor = db.conn.cursor()
    cursor.execute("SELECT caminho_arquivo FROM biblioteca WHERE id = ?", (track_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Música não encontrada")
    
    path = row[0].replace('/', '\\')
    if not os.path.exists(path):
        add_log(f"⚠️ Erro de acesso ao arquivo: {path}")
        raise HTTPException(status_code=404, detail="Arquivo físico inacessível")

    def iterfile():
        try:
            with open(path, mode="rb") as file_like:
                yield from file_like
        except Exception as e:
            add_log(f"❌ Falha ao ler arquivo de rede: {e}")

    media_type, _ = mimetypes.guess_type(path)
    return StreamingResponse(iterfile(), media_type=media_type or "audio/mpeg")

@app.get("/library")
def get_library():
    cursor = db.conn.execute("SELECT id, nome_musica, artista, pasta_categoria, bpm FROM biblioteca ORDER BY artista ASC")
    return [{"id": r[0], "nome": r[1], "artista": r[2], "categoria": r[3], "bpm": r[4]} for r in cursor.fetchall()]

# --- Tasks de Segundo Plano ---

async def run_generation_task(start_date_str: str, days: int):
    state.is_busy = True
    state.logs = []
    add_log(f"🚀 Iniciando geração de {days} dia(s) a partir de {start_date_str}...")
    try:
        engine = PlaylistEngine()
        engine.logger_callback = add_log
        start_date = datetime.datetime.strptime(start_date_str, '%Y%m%d').date()
        for i in range(days):
            current_date = start_date + datetime.timedelta(days=i)
            current_date_str = current_date.strftime('%Y%m%d')
            add_log(f"--- Processando Dia {i+1}/{days}: {current_date_str} ---")
            engine.generate_schedule(current_date_str)
        add_log("✅ Geração concluída com sucesso!")
    except Exception as e:
        add_log(f"❌ Erro crítico na geração: {str(e)}")
        logger.exception("Falha na geração")
    finally:
        state.is_busy = False

async def run_sync_task():
    state.is_busy = True
    state.logs = []
    add_log("🚀 Iniciando Sincronização Geral da Biblioteca...")
    try:
        engine = PlaylistEngine(log_callback=add_log)
        music_root = config.get_path('MUSIC_ROOT')
        if not os.path.exists(music_root):
            add_log(f"❌ Erro: Raiz de músicas não encontrada em {music_root}")
            return
        categories = [d for d in os.listdir(music_root) if os.path.isdir(os.path.join(music_root, d))]
        for cat in categories:
            folder_path = os.path.join(music_root, cat)
            add_log(f"--- Escaneando: {cat} ---")
            engine.sync_folder_to_db(folder_path, cat)
        add_log("✨ Sincronização concluída!")
    except Exception as e:
        add_log(f"❌ Erro na sincronização: {str(e)}")
        logger.exception("Falha no sync")
    finally:
        state.is_busy = False

@app.post("/generate")
async def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks):
    if state.is_busy:
        raise HTTPException(status_code=400, detail="O sistema está ocupado.")
    background_tasks.add_task(run_generation_task, req.start_date, req.days)
    return {"status": "started"}

@app.post("/sync")
async def start_sync(background_tasks: BackgroundTasks):
    if state.is_busy:
        raise HTTPException(status_code=400, detail="O sistema está ocupado.")
    background_tasks.add_task(run_sync_task)
    return {"status": "started"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=False)
