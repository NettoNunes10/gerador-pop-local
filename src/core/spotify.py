import requests
import base64
import time
from .config import config

class SpotifyService:
    def __init__(self):
        self.token = None
        self.token_expires = 0
        self.client_id = config.get_path('spotify_client_id')
        self.client_secret = config.get_path('spotify_client_secret')

    def _get_token(self):
        """Obtém ou renova o token de acesso do Spotify."""
        if self.token and time.time() < self.token_expires:
            return self.token

        self.client_id = config.get_path('spotify_client_id')
        self.client_secret = config.get_path('spotify_client_secret')

        if not self.client_id or not self.client_secret:
            return None

        auth_str = f"{self.client_id}:{self.client_secret}"
        auth_b64 = base64.b64encode(auth_str.encode()).decode()

        url = "https://accounts.spotify.com/api/token"
        headers = {"Authorization": f"Basic {auth_b64}"}
        data = {"grant_type": "client_credentials"}

        try:
            response = requests.post(url, headers=headers, data=data)
            if response.status_code == 200:
                res_data = response.json()
                self.token = res_data['access_token']
                # Expira em 1 hora, mas renovamos 5 min antes por segurança
                self.token_expires = time.time() + res_data['expires_in'] - 300
                return self.token
        except Exception as e:
            print(f"[SPOTIFY] Erro ao obter token: {e}")
        return None

    def search_track(self, artist, title):
        """Busca o ID de uma música no Spotify."""
        token = self._get_token()
        if not token: return None

        query = f"track:{title} artist:{artist}"
        url = "https://api.spotify.com/v1/search"
        headers = {"Authorization": f"Bearer {token}"}
        params = {"q": query, "type": "track", "limit": 1}

        try:
            response = requests.get(url, headers=headers, params=params)
            if response.status_code == 200:
                results = response.json().get('tracks', {}).get('items', [])
                if results:
                    return results[0]['id']
            elif response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 5))
                print(f"[SPOTIFY] Rate limit atingido. Aguardando {retry_after}s...")
                time.sleep(retry_after)
                return self.search_track(artist, title)
        except Exception as e:
            print(f"[SPOTIFY] Erro na busca: {e}")
        return None

    def get_audio_features(self, spotify_id):
        """Captura os dados de Energia, Valence e Danceability."""
        token = self._get_token()
        if not token or not spotify_id: return None

        url = f"https://api.spotify.com/v1/audio-features/{spotify_id}"
        headers = {"Authorization": f"Bearer {token}"}

        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                return {
                    'energy': data.get('energy', 0.5),
                    'valence': data.get('valence', 0.5),
                    'danceability': data.get('danceability', 0.5)
                }
            elif response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 5))
                time.sleep(retry_after)
                return self.get_audio_features(spotify_id)
        except Exception as e:
            print(f"[SPOTIFY] Erro ao obter features: {e}")
        return None

spotify_service = SpotifyService()
