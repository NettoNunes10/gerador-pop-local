from fastapi import FastAPI, BackgroundTasks, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import os
import datetime
import logging
import urllib.parse
import shutil
from typing import Optional
from .core.config import config
from .core.engine import PlaylistEngine
from .core.database import db

# Configuração de Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gerador POP API")
engine = PlaylistEngine() # Criado aqui para estar disponível globalmente

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    start_date: str
    days: int

@app.get("/status")
def get_status():
    return {
        "status": "online",
        "is_busy": engine.is_busy,
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
    return {"logs": engine.logs, "is_busy": engine.is_busy}

@app.get("/stats")
def get_stats():
    if engine.is_busy:
        return {"categories": [], "top_artists": []}
    return db.get_stats()


@app.get("/stream/{track_id}")
def stream_audio(track_id: int):
    cursor = db.conn.execute("SELECT caminho_arquivo FROM biblioteca WHERE id = ?", (track_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Música não encontrada")
    
    source_path = row[0].replace('/', '\\')
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Arquivo físico não encontrado")

    return FileResponse(source_path)

@app.get("/library")
def get_library(
    page: int = 1,
    limit: int = 100,
    search: Optional[str] = None,
    category: Optional[str] = None,
    group: Optional[str] = None,
    bpm: Optional[str] = None,
    sort: str = "artista"
):
    # Construção dinâmica da query
    conditions = []
    params = []
    if search:
        conditions.append("(LOWER(artista) LIKE ? OR LOWER(nome_musica) LIKE ?)")
        term = f"%{search.lower()}%"
        params.extend([term, term])
    if category:
        conditions.append("pasta_categoria = ?")
        params.append(category)
    if group:
        conditions.append("sub_categoria = ?")
        params.append(group)
    if bpm == "L":
        conditions.append("bpm < 80")
    elif bpm == "M":
        conditions.append("bpm >= 80 AND bpm <= 120")
    elif bpm == "H":
        conditions.append("bpm > 120")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sort_map = {
        "artista": "artista ASC",
        "nome": "nome_musica ASC",
        "data_desc": "data_arquivo DESC NULLS LAST",
        "data_asc": "data_arquivo ASC NULLS LAST",
        "peso_desc": "peso_especifico DESC",
    }
    order = sort_map.get(sort, "artista ASC")

    count_row = db.conn.execute(f"SELECT COUNT(*) FROM biblioteca {where}", params).fetchone()
    total = count_row[0]

    offset = (page - 1) * limit
    rows = db.conn.execute(
        f"SELECT id, nome_musica, artista, pasta_categoria, bpm, peso_especifico, sub_categoria, data_arquivo FROM biblioteca {where} ORDER BY {order} LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()

    return {
        "items": [
            {
                "id": r[0], "nome": r[1], "artista": r[2],
                "categoria": r[3], "bpm": r[4], "peso": r[5],
                "sub_categoria": r[6], "data_arquivo": r[7]
            } for r in rows
        ],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit))
    }

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


# --- Tasks de Segundo Plano (Thread Dedicada) ---

import threading

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
    try:
        engine.sync_all()
    except Exception as e:
        print(f"Erro no sync task: {e}")

@app.post("/generate")
async def start_generation(req: GenerateRequest):
    if engine.is_busy:
        raise HTTPException(status_code=400, detail="O sistema está ocupado.")
    t = threading.Thread(target=run_generation_task, args=(req.start_date, req.days), daemon=True)
    t.start()
    return {"status": "started"}

@app.post("/sync")
async def start_sync():
    if engine.is_busy:
        raise HTTPException(status_code=400, detail="O sistema está ocupado.")
    t = threading.Thread(target=run_sync_task, daemon=True)
    t.start()
    return {"status": "started"}

@app.middleware("http")
async def log_requests(request, call_next):
    # Print no terminal para cada request (ajuda a saber se o backend travou)
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {request.method} {request.url.path}")
    return await call_next(request)

# --- Watchdog (Printa status no terminal a cada 30s) ---
def watchdog():
    import time
    while True:
        try:
            print(f"--- HEARTBEAT: Servidor Ativo | Busy: {state.is_busy} | Logs: {len(state.logs)} ---")
        except: pass
        time.sleep(30)

threading.Thread(target=watchdog, daemon=True).start()

if __name__ == "__main__":
    import uvicorn
    # Passando o objeto app diretamente para evitar erros de importação
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
