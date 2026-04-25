
import os
import sys
# Adiciona o diretório atual ao path para importar src
sys.path.append(os.getcwd())

from src.core.database import db
from src.core.config import config
from datetime import datetime
import random

def test():
    cursor = db.conn.cursor()
    query = 'SELECT b.*, (SELECT MAX(data_hora) FROM historico_execucao h WHERE h.caminho_arquivo = b.caminho_arquivo) as ultima_vez FROM biblioteca b WHERE b.pasta_categoria = "SERTANEJO" ORDER BY RANDOM() LIMIT 500'
    cursor.execute(query)
    candidates = cursor.fetchall()
    if candidates:
        print(f"Row keys: {list(candidates[0].keys())}")
    
    now = datetime.now()
    recent_artists = db.get_recent_artists(9)
    recent_tracks = db.get_recent_tracks(0)
    
    scores = []
    for cand in candidates:
        filepath = cand['caminho_arquivo']
        if not os.path.exists(filepath): continue
        
        artists = [a.strip().upper() for a in (cand['artista'] or "").split(',')]
        is_recent = any(a in recent_artists for a in artists)
        
        ultima_vez_str = cand['ultima_vez']
        if ultima_vez_str:
            try:
                ultima_vez = datetime.fromisoformat(ultima_vez_str)
                delta = now - ultima_vez
                minutes_since = delta.total_seconds() / 60
            except:
                minutes_since = 14400
        else:
            minutes_since = 14400 

        weight = cand['peso_especifico'] or 1.0
        is_favorite = any(a in config.favorite_artists for a in artists)
        mult = 1.5 if is_favorite else 1.0
        
        score = (minutes_since * weight * mult) + random.uniform(0, 10)
        if is_recent:
            score *= 0.1
            
        scores.append({
            'artista': cand['artista'],
            'nome': cand['nome_musica'],
            'weight': weight,
            'minutes_since': minutes_since,
            'mult': mult,
            'is_recent': is_recent,
            'score': score
        })
        
    weighted_found = [s for s in scores if s['weight'] > 1.0]
    print(f"\nWeighted songs found in candidates: {len(weighted_found)}")
    print(f"{'ARTISTA':<30} | {'NOME':<30} | {'W':<4} | {'MINS':<8} | {'MULT':<4} | {'REC':<3} | {'SCORE':<8}")
    print("-" * 100)
    for s in weighted_found[:10]:
        print(f"{s['artista'][:30]:<30} | {s['nome'][:30]:<30} | {s['weight']:<4.1f} | {s['minutes_since']:<8.0f} | {s['mult']:<4.1f} | {str(s['is_recent'])[0]:<3} | {s['score']:<8.0f}")

    print("\nTop 10 overall:")
    for s in scores[:10]:
        print(f"{s['artista'][:30]:<30} | {s['nome'][:30]:<30} | {s['weight']:<4.1f} | {s['minutes_since']:<8.0f} | {s['mult']:<4.1f} | {str(s['is_recent'])[0]:<3} | {s['score']:<8.0f}")

if __name__ == "__main__":
    test()
