from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import datetime
import logging
import threading
from typing import Optional
from .core.config import AUDIO_EXTENSIONS, config
from .core.engine import PlaylistEngine
from .core.database import db
from .core.enricher import MusicEnricher
from .blm_manager import BLMService

# Configuração de Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gerador POP API")
engine = PlaylistEngine() # Instância global única

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    start_date: str
    days: int

def _resolve_under(base_dir: str, *parts: str) -> str:
    if not base_dir:
        raise HTTPException(status_code=400, detail="Diretorio base nao configurado")

    base_real = os.path.realpath(base_dir)
    target = os.path.realpath(os.path.join(base_real, *parts))
    try:
        common = os.path.commonpath([base_real, target])
    except ValueError:
        raise HTTPException(status_code=400, detail="Caminho invalido")

    if common != base_real:
        raise HTTPException(status_code=400, detail="Caminho fora do diretorio permitido")
    return target

def _validate_blm_filename(filename: str) -> str:
    clean = os.path.basename(filename)
    if clean != filename or not clean.lower().endswith((".blm", ".blmn")):
        raise HTTPException(status_code=400, detail="Nome de modelo invalido")
    return clean

def _template_path(filename: str) -> str:
    template_dir = config.paths.get('MODELOS', config.paths.get('TEMPLATES'))
    return _resolve_under(template_dir, _validate_blm_filename(filename))

def _converted_blmn_path(filename: str) -> str:
    stem = os.path.splitext(_validate_blm_filename(filename))[0]
    return _template_path(f"{stem}.blmn")

def _allowed_roots():
    roots = []
    for value in config.paths.values():
        if isinstance(value, str) and value.strip():
            roots.append(value.strip())
    for custom_var in config.custom_vars:
        path = (custom_var.get("path") or "").strip()
        if path:
            roots.append(path if os.path.isdir(path) else os.path.dirname(path))
    return [os.path.realpath(root) for root in roots if root and os.path.exists(root)]

def _is_allowed_path(path: str) -> bool:
    target = os.path.realpath(path)
    for root in _allowed_roots():
        try:
            if os.path.commonpath([root, target]) == root:
                return True
        except ValueError:
            continue
    return False

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
    template_dir = config.paths.get('MODELOS', config.paths.get('TEMPLATES'))
    if not template_dir or not os.path.exists(template_dir):
        return []
    return sorted([f for f in os.listdir(template_dir) if f.lower().endswith(('.blmn', '.blm'))])

@app.get("/blm/{filename}")
def get_blm_content(filename: str):
    path = _template_path(filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    try:
        structured = BLMService.load_structured(path)
        response_filename = filename
        converted_from = None
        if filename.lower().endswith(".blm"):
            converted_from = filename
            response_filename = f"{os.path.splitext(filename)[0]}.blmn"
            BLMService.save_structured(structured, _converted_blmn_path(filename))

        return {
            "format": "BLMN",
            "filename": response_filename,
            "converted_from": converted_from,
            "header": structured.header,
            "blocks": [
                {
                    "time": b.time,
                    "vibe_min": b.vibe_min,
                    "vibe_max": b.vibe_max,
                    "items": [
                        {"resource": l.resource, "mix": l.mix}
                        for l in b.items
                    ]
                } for b in structured.blocks
            ],
            "orphan_lines": [{"resource": l.resource, "mix": l.mix} for l in structured.orphan_lines],
            "stats": BLMService.get_stats(structured)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/blm/{filename}")
def save_blm_content(filename: str, data: dict = Body(...)):
    if filename.lower().endswith(".blm"):
        raise HTTPException(status_code=400, detail="Modelos .blm sao somente leitura. Abra o arquivo para converter automaticamente para .blmn.")
    path = _template_path(filename)
    
    try:
        model = BLMService.from_payload(data)
        BLMService.save_structured(model, path)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/blm/{filename}")
def delete_blm_file(filename: str):
    path = _template_path(filename)
    
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    try:
        os.remove(path)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/list_files")
def list_files(path: str):
    if not path or not os.path.exists(path):
        return []
    if not _is_allowed_path(path):
        raise HTTPException(status_code=400, detail="Caminho fora das pastas configuradas")
    if os.path.isfile(path):
        return [os.path.basename(path)]
    try:
        files = [f for f in os.listdir(path) if f.lower().endswith(AUDIO_EXTENSIONS)]
        return sorted(files)
    except:
        return []

@app.get("/categories")
def get_categories():
    cursor = db.conn.cursor()
    cursor.execute("SELECT DISTINCT pasta_categoria FROM biblioteca")
    cats = [row[0] for row in cursor.fetchall() if row[0]]
    return sorted(cats)

@app.get("/config")
def get_config():
    return {
        "paths": config.paths,
        "favorite_artists": list(config.favorite_artists),
        "paid_rules": config.paid_rules,
        "day_templates": config.day_templates,
        "rotation_groups": config.rotation_groups,
        "custom_vars": config.custom_vars,
        "default_category": config.default_category,
        "default_vibe_min": config.default_vibe_min,
        "default_vibe_max": config.default_vibe_max,
        "type_colors": config.type_colors
    }

@app.post("/config")
def update_config(new_config: dict):
    try:
        config.save(new_config)
        # Sincroniza artistas favoritos com o banco de dados
        if 'favorite_artists' in new_config:
            db.sync_favorites(new_config['favorite_artists'])
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
    conditions = []
    params = []
    if search:
        conditions.append("(unaccent(artista) LIKE unaccent(?) OR unaccent(nome_musica) LIKE unaccent(?))")
        term = f"%{search}%"
        params.extend([term, term])
    if category:
        conditions.append("pasta_categoria = ?")
        params.append(category)
    if group:
        conditions.append("sub_categoria = ?")
        params.append(group)
    
    # Filtros de BPM restaurados
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
        "bpm_desc": "bpm DESC",
        "bpm_asc": "bpm ASC",
        "peso_desc": "peso_especifico DESC",
        "peso_asc": "peso_especifico ASC",
    }
    order = sort_map.get(sort, "artista ASC")

    count_row = db.conn.execute(f"SELECT COUNT(*) FROM biblioteca {where}", params).fetchone()
    total = count_row[0]
    offset = (page - 1) * limit
    
    query = f"""
        SELECT id, nome_musica, artista, pasta_categoria, bpm, peso_especifico, 
               sub_categoria, data_arquivo FROM biblioteca {where} ORDER BY {order} LIMIT ? OFFSET ?
    """
    rows = db.conn.execute(query, params + [limit, offset]).fetchall()

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
    if "energy" in data:
        db.conn.execute("UPDATE biblioteca SET energy = ? WHERE id = ?", (float(data["energy"]), track_id))
        db.conn.commit()
    if "valence" in data:
        db.conn.execute("UPDATE biblioteca SET valence = ? WHERE id = ?", (float(data["valence"]), track_id))
        db.conn.commit()
    
    if "weight" in data:
        new_weight = float(data["weight"])
        new_group = config.get_group_for_weight(new_weight)
        db.update_weight(track_id, new_weight)
        db.update_subcategory(track_id, new_group)
        return {"status": "updated", "new_weight": new_weight, "new_group": new_group}
    
    if "sub_categoria" in data:
        new_group = data["sub_categoria"]
        new_weight = config.get_base_weight_for_group(new_group)
        db.update_subcategory(track_id, new_group)
        db.update_weight(track_id, new_weight)
        return {"status": "updated", "new_group": new_group, "new_weight": new_weight}
    
    return {"status": "updated"}

@app.post("/library/batch")
def batch_update_library(data: dict = Body(...)):
    track_ids = data.get("track_ids", [])
    if not track_ids:
        raise HTTPException(status_code=400, detail="Nenhum track selecionado")
    
    if "weight" in data:
        new_weight = float(data["weight"])
        new_group = config.get_group_for_weight(new_weight)
        for tid in track_ids:
            db.update_weight(tid, new_weight)
            db.update_subcategory(tid, new_group)
        return {"status": "updated", "count": len(track_ids), "new_weight": new_weight, "new_group": new_group}

    if "sub_categoria" in data:
        new_group = data["sub_categoria"]
        new_weight = config.get_base_weight_for_group(new_group)
        for tid in track_ids:
            db.update_subcategory(tid, new_group)
            db.update_weight(tid, new_weight)
        return {"status": "updated", "count": len(track_ids), "new_group": new_group, "new_weight": new_weight}
    
    return {"status": "no_change"}

@app.delete("/library/{track_id}")
def delete_track(track_id: int):
    # 1. Busca o caminho do arquivo
    cursor = db.conn.cursor()
    cursor.execute("SELECT caminho_arquivo FROM biblioteca WHERE id = ?", (track_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Música não encontrada")
    
    filepath = row[0]
    if not _is_allowed_path(filepath):
        raise HTTPException(status_code=400, detail="Arquivo fora das pastas configuradas")
    
    # 2. Deleta do disco se existir
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception as e:
            logger.error(f"Erro ao deletar arquivo físico {filepath}: {e}")
            # Continuamos para limpar o banco mesmo se o arquivo físico der erro

    # 3. Limpa o banco de dados
    db.conn.execute("DELETE FROM historico_execucao WHERE caminho_arquivo = ?", (filepath,))
    db.conn.execute("DELETE FROM biblioteca WHERE id = ?", (track_id,))
    db.conn.commit()
    
    return {"status": "deleted", "path": filepath}

@app.post("/library/reset")
def reset_library_history():
    try:
        db.reset_all_history()
        return {"status": "success", "message": "Histórico resetado com sucesso para ontem às 01:00."}
    except Exception as e:
        logger.error(f"Erro ao resetar histórico: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Tasks de Segundo Plano ---

def run_generation_task(start_date_str: str, days: int):
    try:
        engine.is_busy = True
        engine.logs = []
        engine.log(f"Iniciando geracao de {days} dia(s) a partir de {start_date_str}...")
        start_date = datetime.datetime.strptime(start_date_str, '%Y%m%d').date()
        for i in range(days):
            current_date = start_date + datetime.timedelta(days=i)
            current_date_str = current_date.strftime('%Y%m%d')
            engine.log(f"--- Processando Dia {i+1}/{days}: {current_date_str} ---")
            engine.generate_schedule(current_date_str, manage_busy=False)
        engine.log("Geracao concluida com sucesso!")
    except Exception as e:
        engine.log(f"Erro critico na geracao: {str(e)}")
        logger.exception("Falha na geracao")
    finally:
        engine.is_busy = False

def run_sync_task():
    try:
        engine.sync_all()
    except Exception as e:
        print(f"❌ Erro no sync_task: {e}")

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

@app.post("/enrich/pending")
async def start_enrichment():
    if engine.is_busy:
        raise HTTPException(status_code=400, detail="O sistema está ocupado.")
    
    def run_enrich():
        enricher = MusicEnricher()
        enricher.enrich_pending()
        
    t = threading.Thread(target=run_enrich, daemon=True)
    t.start()
    return {"status": "started"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003, reload=False)
