
import sqlite3
import os

db_path = "base_dados_radio.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- Músicas com Peso > 3.0 ---")
cursor.execute("SELECT id, artista, nome_musica, pasta_categoria, sub_categoria, peso_especifico, data_ultima_execucao FROM biblioteca WHERE peso_especifico > 3.0 ORDER BY peso_especifico DESC")
rows = cursor.fetchall()
for row in rows:
    print(dict(row))

print("\n--- Categorias Únicas no Banco ---")
cursor.execute("SELECT DISTINCT pasta_categoria FROM biblioteca")
print([r[0] for r in cursor.fetchall()])

print("\n--- Subcategorias Únicas no Banco ---")
cursor.execute("SELECT DISTINCT sub_categoria FROM biblioteca")
print([r[0] for r in cursor.fetchall()])

conn.close()
