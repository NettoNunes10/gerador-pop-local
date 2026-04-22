import requests
import base64
import json
import os

# Carrega chaves do settings.json
def test():
    try:
        with open('settings.json', 'r') as f:
            settings = json.load(f)
            client_id = settings['paths'].get('spotify_client_id')
            client_secret = settings['paths'].get('spotify_client_secret')
    except:
        print("❌ Erro: Não foi possível ler o settings.json")
        return

    if not client_id or not client_secret:
        print("❌ Erro: Client ID ou Secret não configurados no settings.json")
        return

    print(f"🔑 Autenticando com ID: {client_id[:5]}...")
    
    # 1. Pegar Token
    auth_str = f"{client_id}:{client_secret}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    token_url = "https://accounts.spotify.com/api/token"
    res = requests.post(token_url, headers={"Authorization": f"Basic {auth_b64}"}, data={"grant_type": "client_credentials"})
    
    if res.status_code != 200:
        print(f"❌ Erro de Autenticação ({res.status_code}): {res.text}")
        return
    
    token = res.json()['access_token']
    print("✅ Token obtido com sucesso!")

    # 2. Testar busca
    track = "Bohemian Rhapsody"
    print(f"🔎 Testando busca por: {track}...")
    search_url = f"https://api.spotify.com/v1/search?q={track}&type=track&limit=1"
    res = requests.get(search_url, headers={"Authorization": f"Bearer {token}"})
    
    if res.status_code != 200:
        print(f"❌ Erro na busca ({res.status_code}): {res.text}")
        return
    
    track_id = res.json()['tracks']['items'][0]['id']
    print(f"✅ Música encontrada! ID: {track_id}")

    # 3. Testar Audio Features (O ponto crítico)
    print("🥁 O momento da verdade: Testando Audio Features...")
    features_url = f"https://api.spotify.com/v1/audio-features/{track_id}"
    res = requests.get(features_url, headers={"Authorization": f"Bearer {token}"})
    
    if res.status_code == 200:
        print("🚀 SUCESSO! A API está funcionando perfeitamente.")
        print(json.dumps(res.json(), indent=2))
    else:
        print(f"❌ FALHA CRÍTICA ({res.status_code})")
        print(f"Mensagem do Spotify: {res.text}")
        if res.status_code == 403:
            print("\n⚠️  CONFIRMADO: Seu aplicativo do Spotify não tem permissão para acessar os dados de energia (Audio Features).")
            print("Isso geralmente acontece com novos apps criados após a mudança de política do Spotify em 2024.")

if __name__ == "__main__":
    test()
