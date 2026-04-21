from fastapi import FastAPI, BackgroundTasks, HTTPException, Body
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
        "day_templates": config.day_templates,
        "rotation_groups": config.rotation_groups
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

import shutil

@app.get("/stream/{track_id}")
def stream_audio(track_id: int):
    cursor = db.conn.cursor()
    cursor.execute("SELECT caminho_arquivo FROM biblioteca WHERE id = ?", (track_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Música não encontrada")
    
    source_path = row[0].replace('/', '\\')
    if not os.path.exists(source_path):
        add_log(f"⚠️ Arquivo inacessível: {source_path}")
        raise HTTPException(status_code=404, detail="Arquivo físico inacessível")

    # Estratégia de Fuga de Rede: Copia para local antes de tocar
    temp_dir = "web/public/temp_stream"
    os.makedirs(temp_dir, exist_ok=True)
    
    ext = os.path.splitext(source_path)[1]
    temp_filename = f"track_{track_id}{ext}"
    local_path = os.path.join(temp_dir, temp_filename)
    
    try:
        if not os.path.exists(local_path):
            shutil.copy2(source_path, local_path)
        
        # Retorna o arquivo local que o navegador consegue ler sem problemas de rede
        return FileResponse(local_path)
    except Exception as e:
        add_log(f"❌ Falha ao copiar para streaming local: {e}")
        raise HTTPException(status_code=500, detail="Erro ao preparar áudio")

@app.get("/library")
def get_library():
    cursor = db.conn.execute("SELECT id, nome_musica, artista, pasta_categoria, bpm, peso_especifico, sub_categoria FROM biblioteca ORDER BY artista ASC")
    return [
        {
            "id": r[0], 
            "nome": r[1], 
            "artista": r[2], 
            "categoria": r[3], 
            "bpm": r[4],
            "peso": r[5],
            "sub_categoria": r[6]
        } for r in cursor.fetchall()
    ]

@app.put("/library/{track_id}")
def update_track_metadata(track_id: int, data: dict = Body(...)):
    """Atualiza metadados de uma faixa com lógica bidirecional peso<->grupo."""
    if "weight" in data:
        new_weight = float(data["weight"])
        # Peso muda → recalcula o grupo automaticamente
        new_group = config.get_group_for_weight(new_weight)
        db.update_weight(track_id, new_weight)
        db.update_subcategory(track_id, new_group)
        return {"status": "updated", "new_weight": new_weight, "new_group": new_group}
    
    if "sub_categoria" in data:
        new_group = data["sub_categoria"]
        # Grupo muda → seta o peso base do grupo
        new_weight = config.get_base_weight_for_group(new_group)
        db.update_subcategory(track_id, new_group)
        db.update_weight(track_id, new_weight)
        return {"status": "updated", "new_group": new_group, "new_weight": new_weight}
    
    return {"status": "no_change"}

@app.post("/library/batch")
def batch_update_library(data: dict = Body(...)):
    """Atualiza peso/grupo em lote para uma lista de track_ids."""
    track_ids = data.get("track_ids", [])
    if not track_ids:
        raise HTTPException(status_code=400, detail="Nenhum track selecionado")
    
    if "sub_categoria" in data:
        new_group = data["sub_categoria"]
        new_weight = config.get_base_weight_for_group(new_group)
        for tid in track_ids:
            db.update_subcategory(tid, new_group)
            db.update_weight(tid, new_weight)
        return {"status": "updated", "count": len(track_ids), "new_group": new_group, "new_weight": new_weight}
    
    return {"status": "no_change"}


# --- Tasks de Segundo Plano ---

def run_generation_task(start_date_str: str, days: int):
    state.is_busy = True
    state.logs = []
    add_log(f"Iniciando geracao de {days} dia(s) a partir de {start_date_str}...")
    try:
        engine = PlaylistEngine(log_callback=add_log)
        start_date = datetime.datetime.strptime(start_date_str, '%Y%m%d').date()
        for i in range(days):
            current_date = start_date + datetime.timedelta(days=i)
            current_date_str = current_date.strftime('%Y%m%d')
            add_log(f"--- Processando Dia {i+1}/{days}: {current_date_str} ---")
            engine.generate_schedule(current_date_str)
        add_log("Geracao concluida com sucesso!")
    except Exception as e:
        add_log(f"Erro critico na geracao: {str(e)}")
        logger.exception("Falha na geracao")
    finally:
        state.is_busy = False

def run_sync_task():
    state.is_busy = True
    state.logs = []
    add_log("Iniciando Sincronizacao Geral da Biblioteca...")
    try:
        engine = PlaylistEngine(log_callback=add_log)
        music_root = config.get_path('MUSIC_ROOT')
        if not os.path.exists(music_root):
            add_log(f"Erro: Raiz de musicas nao encontrada em {music_root}")
            return
        
        # Filtra pastas de sistema e ocultas (começam com $)
        categories = [d for d in os.listdir(music_root) if os.path.isdir(os.path.join(music_root, d)) and not d.startswith('$')]
        
        for cat in categories:
            folder_path = os.path.join(music_root, cat)
            engine.sync_folder_to_db(folder_path, cat)
        add_log("Sincronizacao concluida!")
    except Exception as e:
        add_log(f"Erro na sincronizacao: {str(e)}")
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
