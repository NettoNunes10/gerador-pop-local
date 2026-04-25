from dataclasses import dataclass, field
from typing import Dict, List, Optional

@dataclass
class BLMLine:
    """Representa uma linha individual de um arquivo .blm ou .bil"""
    resource: str  # Ex: "SERTANEJO.apm" ou "00:00" ou "M:\musica.mp3"
    params: Dict[str, str] = field(default_factory=dict) # Ex: {"m": "3000", "t": "0"}
    raw_line: str = "" # Mantém a linha original para debug

    def get_int(self, key: str, default: int = 0) -> int:
        """Retorna um parâmetro como inteiro com segurança"""
        try:
            val = self.params.get(key, str(default))
            return int(val)
        except (ValueError, TypeError):
            return default

    def __repr__(self):
        return f"<BLMLine resource='{self.resource}' params={len(self.params)}>"

@dataclass
class BLMFile:
    """Representa o arquivo .blm completo"""
    header: str = "" # A primeira linha "# Arquivo de roteiro..."
    lines: List[BLMLine] = field(default_factory=list)

    def to_structured(self) -> 'StructuredBLM':
        """Converte a lista plana de linhas em uma estrutura de blocos"""
        structured = StructuredBLM(header=self.header)
        current_block = None

        for line in self.lines:
            # Se a linha for um marcador de tempo (ex: 00:00)
            if line.resource[0].isdigit() and ':' in line.resource and len(line.resource) <= 5:
                current_block = BLMBlock(time=line.resource, marker_line=line)
                structured.blocks.append(current_block)
            else:
                if current_block is not None:
                    current_block.items.append(line)
                else:
                    # Linhas antes do primeiro bloco (raro)
                    structured.orphan_lines.append(line)
        return structured

@dataclass
class BLMBlock:
    """Representa um bloco de horário (ex: o que acontece das 00:00 às 00:30)"""
    time: str
    marker_line: BLMLine
    items: List[BLMLine] = field(default_factory=list)

@dataclass
class StructuredBLM:
    """A estrutura 'proprietária' que organiza o roteiro por blocos"""
    header: str = ""
    blocks: List[BLMBlock] = field(default_factory=list)
    orphan_lines: List[BLMLine] = field(default_factory=list)

    def to_flat(self) -> BLMFile:
        """Converte de volta para o formato plano de linhas do arquivo"""
        blm_file = BLMFile(header=self.header)
        blm_file.lines.extend(self.orphan_lines)
        for block in self.blocks:
            blm_file.lines.append(block.marker_line)
            blm_file.lines.extend(block.items)
        return blm_file
